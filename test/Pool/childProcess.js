const { ProcessPoolChildInstance } = require('../../dist')
const { PoolInstanceTestBuilder } = require('./PoolInstanceTest')

const crushErrorStage = process.argv.find(arg => arg.startsWith('crushErrorStage='))?.split('=')[1];
const doNotCrush = process.argv.includes('doNotCrush');

if (crushErrorStage === 'fork') {
    throw new Error('Fork error test');
}

const PoolTestInstance = PoolInstanceTestBuilder(ProcessPoolChildInstance, {
    crushErrorStage,
    doNotCrush
})

new PoolTestInstance()
