import { setTimeout } from 'timers/promises';
import { PoolManager, PoolInstance, PoolStatus, PoolTaskOptions } from '../../src/'
import { shuffleArray } from '../utils';

class PoolInstanceTest implements PoolInstance {
    poolStatus: PoolStatus = {} as PoolStatus;
    async executeTask(task: any) {
        await setTimeout(Math.random() * 10 + 10);
        if ('index' in task) {
            return task;
        } else {
            throw task.error
        }
    }
}

type TaskInput = { index: number } | { error: string }

function testPoolFlow({ poolCount }: { poolCount: number }) {
    describe(`flow with ${poolCount} pools`, () => {
        let poolManager: PoolManager;

        function getTaskCount(dem: number = 1) {
            return (poolCount || 1) * 15 / dem;
        }

        async function executeTasks(tasks: TaskInput[], taskOptions?: PoolTaskOptions) {
            const responses = await Promise.all(tasks.map(task => {
                const taskMut = JSON.parse(JSON.stringify(task))
                return poolManager.proceedRawTask(taskMut, taskOptions).promise;
            }));
            for (let index in tasks) {
                const task = tasks[index];
                const result = responses[index].slice(0, 2);
                if ('index' in task) {
                    expect(result).toStrictEqual([null, task]);
                } else {
                    expect(result).toStrictEqual([task.error, null]);
                }
            }
        }

        function prepareTasks<T>(count: number, generator: (index: number) => T): T[] {
            return 'a'.repeat(count).split('').map((_, index) => generator(index))
        }

        beforeEach(async () => {
            let pools = 'a'.repeat(poolCount).split('').map(() => new PoolInstanceTest)
            poolManager = new PoolManager({
                pools
            })
        })

        test(`${getTaskCount()} success tasks`, async () => {
            const tasks: TaskInput[] = prepareTasks(getTaskCount(), index => ({ index }));
            await executeTasks(tasks);
        })
        test(`${getTaskCount()} error tasks`, async () => {
            const tasks: TaskInput[] = prepareTasks(getTaskCount(), index => ({ error: `Error no ${index}` }));
            await executeTasks(tasks);
        })
        test(`${getTaskCount()} mixed tasks`, async () => {
            const tasks: TaskInput[] = [
                ...prepareTasks(getTaskCount(2), index => ({ index })),
                ...prepareTasks(getTaskCount(2), index => ({ error: `Error no ${index}` }))
            ];
            shuffleArray(tasks);
            await executeTasks(tasks);
        })
    })
}

[
    1,
    2,
    5,
    15,
    100,
].forEach(poolCount => {
    testPoolFlow({ poolCount })
})
