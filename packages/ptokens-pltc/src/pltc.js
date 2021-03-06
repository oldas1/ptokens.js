import Web3 from 'web3'
import Web3PromiEvent from 'web3-core-promievent'
import { NodeSelector } from 'ptokens-node-selector'
import { ltc, eth } from 'ptokens-utils'
import Web3Utils from 'web3-utils'
import { LtcDepositAddress } from './ltc-deposit-address'
import pltcAbi from './utils/contractAbi/pLTCTokenETHContractAbi.json'
import * as bitcoin from 'bitcoinjs-lib'
import {
  PLTC_TOKEN_DECIMALS,
  MINIMUN_SATS_REDEEMABLE,
  LTC_NODE_POLLING_TIME
} from './utils/constants'

export class pLTC {
  /**
   * @param {Object} _configs
   */
  constructor(_configs) {
    const { ethPrivateKey, ethProvider, ltcNetwork, defaultEndpoint } = _configs

    this._web3 = new Web3(ethProvider)

    this.nodeSelector = new NodeSelector({
      pToken: {
        name: 'pLTC',
        redeemFrom: 'ETH'
      },
      defaultEndpoint
    })

    if (ethPrivateKey) {
      this._isWeb3Injected = false
      const account = this._web3.eth.accounts.privateKeyToAccount(
        eth.addHexPrefix(ethPrivateKey)
      )

      this._web3.eth.defaultAccount = account.address
      this._ethPrivateKey = eth.addHexPrefix(ethPrivateKey)
      this._isWeb3Injected = false
    } else {
      this._isWeb3Injected = true
      this._ethPrivateKey = null
    }

    if (ltcNetwork === 'litecoin' || ltcNetwork === 'testnet')
      this._ltcNetwork = ltcNetwork
    else this._ltcNetwork = 'testnet'

    this._contractAddress = null
  }

  /**
   * @param {String} _ethAddress
   */
  async getDepositAddress(_ethAddress) {
    if (!Web3Utils.isAddress(_ethAddress))
      throw new Error('Eth Address is not valid')

    if (!this.nodeSelector.selectedNode) await this.nodeSelector.select()

    const depositAddress = new LtcDepositAddress({
      network: this._ltcNetwork,
      node: this.nodeSelector.selectedNode,
      web3: this._web3
    })

    await depositAddress.generate(_ethAddress)

    if (!depositAddress.verify())
      throw new Error('Node deposit address does not match expected address')

    return depositAddress
  }

  /**
   * @param {Number} _amount
   * @param {String} _ltcAddress
   */
  redeem(_amount, _ltcAddress) {
    const promiEvent = Web3PromiEvent()

    const start = async () => {
      if (_amount < MINIMUN_SATS_REDEEMABLE) {
        promiEvent.reject(
          `Impossible to burn less than ${MINIMUN_SATS_REDEEMABLE} pLTC`
        )
        return
      }

      if (!this.nodeSelector.selectedNode) await this.nodeSelector.select()

      // NOTE: add support for p2sh testnet address (Q...)
      let ltcAddressToCheck = _ltcAddress
      const decoded = bitcoin.address.fromBase58Check(_ltcAddress)
      if (decoded.version === 0xc4)
        ltcAddressToCheck = bitcoin.address.toBase58Check(decoded.hash, 0x3a)

      if (!ltc.isValidAddress(this._ltcNetwork, ltcAddressToCheck)) {
        promiEvent.reject('Ltc Address is not valid')
        return
      }

      try {
        const ethTxReceipt = await eth.makeContractSend(
          this._web3,
          'burn',
          {
            isWeb3Injected: this._isWeb3Injected,
            abi: pltcAbi,
            contractAddress: this._getContractAddress(),
            privateKey: this._ethPrivateKey,
            value: eth.zeroEther
          },
          [eth.correctFormat(_amount, PLTC_TOKEN_DECIMALS, '*'), _ltcAddress]
        )
        promiEvent.eventEmitter.emit('onEthTxConfirmed', ethTxReceipt)

        const broadcastedLtcTxReport = await this.nodeSelector.selectedNode.monitorIncomingTransaction(
          ethTxReceipt.transactionHash,
          promiEvent.eventEmitter
        )

        const broadcastedLtcTx = await ltc.waitForTransactionConfirmation(
          this._ltcNetwork,
          broadcastedLtcTxReport.native_tx_hash,
          LTC_NODE_POLLING_TIME
        )
        promiEvent.eventEmitter.emit('onLtcTxConfirmed', broadcastedLtcTx)

        promiEvent.resolve({
          amount: _amount.toFixed(PLTC_TOKEN_DECIMALS),
          to: _ltcAddress,
          tx: broadcastedLtcTxReport.native_tx_hash
        })
      } catch (err) {
        promiEvent.reject(err)
      }
    }

    start()
    return promiEvent.eventEmitter
  }

  getTotalIssued() {
    return new Promise((resolve, reject) => {
      eth
        .makeContractCall(this._web3, 'totalMinted', {
          isWeb3Injected: this._isWeb3Injected,
          abi: pltcAbi,
          contractAddress: this._getContractAddress()
        })
        .then(totalIssued =>
          resolve(
            eth.correctFormat(parseInt(totalIssued), PLTC_TOKEN_DECIMALS, '/')
          )
        )
        .catch(err => reject(err))
    })
  }

  getTotalRedeemed() {
    return new Promise((resolve, reject) => {
      eth
        .makeContractCall(this._web3, 'totalBurned', {
          isWeb3Injected: this._isWeb3Injected,
          abi: pltcAbi,
          contractAddress: this._getContractAddress()
        })
        .then(totalRedeemed =>
          resolve(
            eth.correctFormat(parseInt(totalRedeemed), PLTC_TOKEN_DECIMALS, '/')
          )
        )
        .catch(err => reject(err))
    })
  }

  getCirculatingSupply() {
    return new Promise((resolve, reject) => {
      eth
        .makeContractCall(this._web3, 'totalSupply', {
          isWeb3Injected: this._isWeb3Injected,
          abi: pltcAbi,
          contractAddress: this._getContractAddress()
        })
        .then(totalSupply =>
          resolve(
            eth.correctFormat(parseInt(totalSupply), PLTC_TOKEN_DECIMALS, '/')
          )
        )
        .catch(err => reject(err))
    })
  }

  /**
   * @param {String} _ethAddress
   */
  getBalance(_ethAddress) {
    return new Promise((resolve, reject) => {
      eth
        .makeContractCall(
          this._web3,
          'balanceOf',
          {
            isWeb3Injected: this._isWeb3Injected,
            abi: pltcAbi,
            contractAddress: this._getContractAddress()
          },
          [_ethAddress]
        )
        .then(balance =>
          resolve(
            eth.correctFormat(parseInt(balance), PLTC_TOKEN_DECIMALS, '/')
          )
        )
        .catch(err => reject(err))
    })
  }

  /**
   * @param {String} _to
   * @param {Number} _amount
   */
  transfer(_to, _amount) {
    return eth.makeContractSend(
      this._web3,
      'transfer',
      {
        isWeb3Injected: this._isWeb3Injected,
        abi: pltcAbi,
        contractAddress: this._getContractAddress(),
        privateKey: this._ethPrivateKey,
        value: eth.zeroEther
      },
      [_to, eth.correctFormat(parseInt(_amount), PLTC_TOKEN_DECIMALS, '*')]
    )
  }

  /**
   * @param {String} _spender
   * @param {Number} _amount
   */
  approve(_spender, _amount) {
    return eth.makeContractSend(
      this._web3,
      'approve',
      {
        isWeb3Injected: this._isWeb3Injected,
        abi: pltcAbi,
        contractAddress: this._getContractAddress(),
        privateKey: this._ethPrivateKey,
        value: eth.zeroEther
      },
      [_spender, eth.correctFormat(parseInt(_amount), PLTC_TOKEN_DECIMALS, '*')]
    )
  }

  /**
   * @param {String} _from
   * @param {String} _to
   * @param {Number} _amount
   */
  transferFrom(_from, _to, _amount) {
    return eth.makeContractSend(
      this._web3,
      'transferFrom',
      {
        isWeb3Injected: this._isWeb3Injected,
        abi: pltcAbi,
        contractAddress: this._getContractAddress(),
        privateKey: this._ethPrivateKey,
        value: eth.zeroEther
      },
      [
        _from,
        _to,
        eth.correctFormat(parseInt(_amount), PLTC_TOKEN_DECIMALS, '*')
      ]
    )
  }

  getBurnNonce() {
    return new Promise((resolve, reject) => {
      eth
        .makeContractCall(this._web3, 'burnNonce', {
          isWeb3Injected: this._isWeb3Injected,
          abi: pltcAbi,
          contractAddress: this._getContractAddress()
        })
        .then(burnNonce => resolve(parseInt(burnNonce)))
        .catch(err => reject(err))
    })
  }

  getMintNonce() {
    return new Promise((resolve, reject) => {
      eth
        .makeContractCall(this._web3, 'mintNonce', {
          isWeb3Injected: this._isWeb3Injected,
          abi: pltcAbi,
          contractAddress: this._getContractAddress()
        })
        .then(mintNonce => resolve(parseInt(mintNonce)))
        .catch(err => reject(err))
    })
  }

  /**
   * @param {String} _owner
   * @param {Address} _spender
   */
  getAllowance(_owner, _spender) {
    return new Promise((resolve, reject) => {
      eth
        .makeContractCall(
          this._web3,
          'allowance',
          {
            isWeb3Injected: this._isWeb3Injected,
            abi: pltcAbi,
            contractAddress: this._getContractAddress()
          },
          [_owner, _spender]
        )
        .then(allowance =>
          resolve(
            eth.correctFormat(parseInt(allowance), PLTC_TOKEN_DECIMALS, '/')
          )
        )
        .catch(err => reject(err))
    })
  }

  async _getContractAddress() {
    if (!this._contractAddress) {
      if (!this.nodeSelector.selectedNode) await this.nodeSelector.select()

      const ethNetwork = await this._web3.eth.net.getNetworkType()
      const info = await this.nodeSelector.selectedNode.getInfo(
        this._ltcNetwork,
        ethNetwork
      )
      this._contractAddress = info['smart-contract-address']
    }

    return this._contractAddress
  }
}
