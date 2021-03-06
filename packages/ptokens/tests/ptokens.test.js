import pTokens from '../src/index'
import { pBTC } from 'ptokens-pbtc'
import { pLTC } from 'ptokens-pltc'
import { expect } from 'chai'

test('Should init pTokens correctly with pBTC and PLTC', () => {
  const configs = {
    pbtc: {
      ethPrivateKey:
        '0x10f41f6e85e1a96acd10d39d391fbaa2653eb52354daef129b4f0e247bf06bd0',
      ethProvider:
        'https://kovan.infura.io/v3/4762c881ac0c4938be76386339358ed6',
      btcNetwork: 'bitcoin'
    },
    pltc: {
      ethPrivateKey:
        '0x10f41f6e85e1a96acd10d39d391fbaa2653eb52354daef129b4f0e247bf06bd0',
      ethProvider:
        'https://kovan.infura.io/v3/4762c881ac0c4938be76386339358ed6',
      ltcNetwork: 'litecoin'
    }
  }
  const ptokens = new pTokens(configs)
  expect(ptokens.pbtc).to.be.an.instanceof(pBTC)
  expect(ptokens.pltc).to.be.an.instanceof(pLTC)
})
