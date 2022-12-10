import { jest, test, expect } from '@jest/globals'
import { parallelPromiseArrayLoop } from './parallelPromiseArrayLoop'

const statement = jest.fn(() => Promise.resolve('foo'))

test('iterates over an array and returns the results if collectResults is true', async () => {
    const iterateArray = [1, 2, 3]
    const result = await parallelPromiseArrayLoop({
        iterateArray,
        statement,
        collectResults: true,
    })
    expect(result).toEqual(['foo', 'foo', 'foo'])
    expect(statement).toHaveBeenCalledWith(1, 0, iterateArray)
    expect(statement).toHaveBeenCalledWith(2, 1, iterateArray)
    expect(statement).toHaveBeenCalledWith(3, 2, iterateArray)
})

test('iterates over an array and returns void if collectResults is false', async () => {
    const iterateArray = [1, 2, 3]
    const result = await parallelPromiseArrayLoop({
        iterateArray,
        statement,
        collectResults: false,
    })
    expect(result).toBe(undefined)
    expect(statement).toHaveBeenCalledWith(1, 0, iterateArray)
    expect(statement).toHaveBeenCalledWith(2, 1, iterateArray)
    expect(statement).toHaveBeenCalledWith(3, 2, iterateArray)
})

test('iterates over an array and returns void if collectResults is not specified', async () => {
    const iterateArray = [1, 2, 3]
    const options = {
        iterateArray,
        statement,
    }
    const result = await parallelPromiseArrayLoop(options)
    expect(result).toBe(undefined)
    expect(statement).toHaveBeenCalledWith(1, 0, iterateArray)
    expect(statement).toHaveBeenCalledWith(2, 1, iterateArray)
    expect(statement).toHaveBeenCalledWith(3, 2, iterateArray)
})
