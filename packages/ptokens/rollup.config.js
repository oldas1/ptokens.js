import pkg from './package.json'
import rollupConfig from '../../rollup.config'

export default rollupConfig('pTokens', pkg.name, {
  'ptokens-peos': 'ptokens-peos',
  'ptokens-pbtc': 'ptokens-pbtc',
  'ptokens-pltc': 'ptokens-pltc',
  'ptokens-utils': 'ptokens-utils'
})
