const { ProcessPoolChildInstance } = require('../../dist')
const { PoolInstanceTestBuilder } = require('./PoolInstanceTest')

const crushErrorStage = process.argv.find(arg => arg.startsWith('crushErrorStage='))?.split('=')[1];

if (crushErrorStage === 'fork') {
    throw new Error('Fork error test');
}

const PoolTestInstance = PoolInstanceTestBuilder(ProcessPoolChildInstance, {
    crushErrorStage
})

new PoolTestInstance()
