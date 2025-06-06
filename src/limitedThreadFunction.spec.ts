import { describe, expect, it } from '@jest/globals';
import { limitedThreadFunction } from './limitedThreadFunction';

describe('limitedThreadFunction', () => {
    it('should process all calls', async () => {
        let counter = 0;
        const incrementCounter = async () => counter++; //randomSleep();

        const limitedIncrementCounter = limitedThreadFunction(incrementCounter);

        // Start three calls to the limited function simultaneously
        const p1 = limitedIncrementCounter();
        const p2 = limitedIncrementCounter();
        const p3 = limitedIncrementCounter();

        // Wait for all calls to complete
        await p1;
        await p2;
        await p3;

        expect(counter).toBe(3);
    });

    it('should properly handle errors thrown by the wrapped function', async () => {
        const throwError = () => {
            throw new Error('test error');
        };

        const limitedThrowError = limitedThreadFunction(throwError);

        // Start two calls to the limited function simultaneously
        const p1 = limitedThrowError();
        const p2 = limitedThrowError();

        // The first call should reject with the error
        await expect(p1).rejects.toThrow('test error');

        // The second call should also reject with the error
        await expect(p2).rejects.toThrow('test error');
    });
});
