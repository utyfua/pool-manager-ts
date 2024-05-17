import { parallelPromiseLoop, parallelPromiseLoopOptions } from './parallelPromiseLoop'

// Define the type of the current iteration state
type State = number;

/**
 * The `parallelPromiseArrayLoopOptions` type is an object that specifies the options
 * that can be passed to the `parallelPromiseArrayLoop` function.
 *
 * @template Element - The type of the elements in the array that will be iterated over.
 * @template Result - The type of the results that will be returned by the `statement` function 
 * if the `collectResults` option is `true`.
 */
export type parallelPromiseArrayLoopOptions<Element = any, Result = any> = {
    /**
     * The `iterateArray` property specifies the array of elements that will be iterated over.
     */
    iterateArray: Element[],
    /**
     * The `statement` property specifies a function that will be called for each element in the
     * `iterateArray`. This function should return a promise that will be resolved when the iteration
     * step is complete.
     *
     * @param element - The current element being iterated over.
     * @param index - The index of the current element.
     * @param iterateArray - The array of elements being iterated over.
     */
    statement: (element: Element, index?: State, iterateArray?: Element[]) => Promise<Result>,
    /**
     * If the `collectResults` property is set to `true`, the results of each iteration step will be
     * collected and returned as an array when the iteration is complete. If `collectResults` is
     * `false` or not specified, the function will return `void` when the iteration is complete.
     */
    collectResults?: boolean,
} & Pick<parallelPromiseLoopOptions<State>, 'maxThreads' | 'attempts' | 'onerror' | 'retryStrategy'>

/**
 * The `parallelPromiseArrayLoop` function iterates over an array of elements in parallel and
 * calls a user-defined function for each element. The iteration will stop when all elements have
 * been processed or when an error occurs.
 *
 * If the `collectResults` option is `true`, the results of each iteration step will be collected
 * and returned as an array when the iteration is complete. If `collectResults` is `false` or
 * not specified, the function will return `void` when the iteration is complete.
 *
 * @param options - An object that specifies the options for the iteration.
 *
 * @returns A promise that will be resolved with an array of the results of each iteration step
 * if the `collectResults` option is `true`. If `collectResults` is `false` or not specified,
 * the promise will be resolved with `void` when the iteration is complete.
 */
export function parallelPromiseArrayLoop<Element extends any = any>(
    options: parallelPromiseArrayLoopOptions<Element> & { collectResults?: false }
): Promise<void>
export function parallelPromiseArrayLoop<Element extends any = any, Result extends any = any>(
    options: parallelPromiseArrayLoopOptions<Element, Result> & { collectResults: true }
): Promise<Result[]>
export async function parallelPromiseArrayLoop<Element extends any = any, Result extends any = any>({
    iterateArray, statement, collectResults,
    maxThreads = 1,
    attempts = 1, onerror, retryStrategy,
}: parallelPromiseArrayLoopOptions<Element, Result>): Promise<void | Result[]> {
    const collectedResponses: Result[] = [];

    await parallelPromiseLoop<State>({
        initialization: () => 0,
        condition: index => index < iterateArray.length,
        finalExpression: index => index + 1,
        statement: async (index) => {
            const result = await statement(iterateArray[index], index, iterateArray);
            if (collectResults) collectedResponses[index] = result;
        },
        maxThreads,
        attempts,
        onerror,
        retryStrategy,
    });

    if (collectResults)
        return collectedResponses;
}
