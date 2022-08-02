const { ProcessPoolChildInstance } = require('../../dist')
const { PoolInstanceTestBuilder } = require('./PoolInstanceTest')

const PoolTestInstance = PoolInstanceTestBuilder(ProcessPoolChildInstance)

new PoolTestInstance()
