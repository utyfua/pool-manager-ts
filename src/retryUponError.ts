/**
 * Options for the `retryUponError` function.
 * @interface
 */
export interface retryUponErrorOptions {
    /**
     * The function to retry.
     * @type {Function}
     */
    func: Function;
    /**
     * A function that determines whether or not the function should be retried based on the current number of attempts and the error that was thrown.
     * @type {Function}
     * @param {number} attempt - The number of times the function has been retried.
     * @param {Error | unknown} error - The error that was thrown.
     * @returns {boolean | Promise<boolean>} - Whether or not the function should be retried.
     */
    retryStrategy?: (attempt: number, error: Error | unknown) => boolean | Promise<boolean>;
    /**
     * A number of attempts
     * 
     * Will be ignored if `retryStrategy` was set
     * 
     * @type {number}
     * 
     */
    attempts?: number;
    /**
     * A function to call when an error is encountered.
     * @type {Function}
     * @param {Error | unknown} error - The error that was thrown.
     * @returns {any | Promise<any>} - The result of the error handling function.
     */
    onerror?: (error: Error | unknown) => any | Promise<any>;
}

export async function retryUponError({
    func,
    attempts = 3,
    onerror,
    retryStrategy = (attempt) => attempt < attempts
}: retryUponErrorOptions) {
    let lastError: Error | unknown | undefined;
    let attempt = 1;
    while (true) {
        try {
            // Try to execute the function
            return await func();
        } catch (error) {
            if (onerror) await onerror(error);
            lastError = error;
            // Check if we should retry the function based on the retry strategy
            if (!retryStrategy(attempt, error)) break;
            attempt++;
        }
    }
    throw lastError;
}