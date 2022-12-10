import { jest, describe, expect, it, beforeEach } from '@jest/globals';
import { retryUponError, retryUponErrorOptions } from './retryUponError';

describe('retryUponError', () => {
    const mockFunc = jest.fn();
    const mockOnError = jest.fn();
    const mockRetryStrategy = jest.fn((attempt: number) => true);

    const options: retryUponErrorOptions = {
        func: mockFunc,
        onerror: mockOnError,
        retryStrategy: mockRetryStrategy
    };

    beforeEach(() => {
        mockFunc.mockClear();
        mockOnError.mockClear();
        mockRetryStrategy.mockClear();
    });

    it('should retry the function based on the retry strategy', async () => {
        mockFunc.mockImplementation(() => {
            throw new Error('Mock error');
        });
        mockRetryStrategy.mockImplementation((attempt) => attempt < 3);

        await expect(retryUponError(options)).rejects.toThrow('Mock error');
        expect(mockFunc).toHaveBeenCalledTimes(3);
        expect(mockOnError).toHaveBeenCalledTimes(3);
        expect(mockRetryStrategy).toHaveBeenCalledTimes(3);
    });

    it('should not retry the function if the retry strategy returns false', async () => {
        mockFunc.mockImplementation(() => {
            throw new Error('Mock error');
        });
        mockRetryStrategy.mockImplementation(() => false);

        await expect(retryUponError(options)).rejects.toThrow('Mock error');
        expect(mockFunc).toHaveBeenCalledTimes(1);
        expect(mockOnError).toHaveBeenCalledTimes(1);
        expect(mockRetryStrategy).toHaveBeenCalledTimes(1);
    });

    it('should return the result of the function if it does not throw an error', async () => {
        mockFunc.mockImplementation(() => 'mock result');

        const result = await retryUponError(options);
        expect(result).toBe('mock result');
        expect(mockFunc).toHaveBeenCalledTimes(1);
        expect(mockOnError).not.toHaveBeenCalled();
        expect(mockRetryStrategy).not.toHaveBeenCalled();
    })
})
