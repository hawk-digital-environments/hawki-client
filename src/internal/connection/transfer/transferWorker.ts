export function transferWorker(
    itemsToProcess: (() => Promise<any>)[],
    concurrencyLimit: number = 3,
    beforeWorkerStarts?: () => void | Promise<void>,
    onCancel?: () => void
) {
    let isCancelled = false;

    let resolveDone: (value: any) => void;
    let rejectDone: (reason?: any) => void;
    const done = new Promise<any[]>((resolve, reject) => {
        resolveDone = resolve;
        rejectDone = reject;
    });

    const cancel = (reason?: any) => {
        isCancelled = true;
        rejectDone(new CancellationError('The worker was cancelled.' + (reason ? ` Reason: ${reason}` : '')));
        onCancel?.();
    };

    const itemsWithId = itemsToProcess.map((item, index) => ({id: index, item}));

    let result: any[] = [];
    const runWorker = async () => {
        const entry = itemsWithId.shift();
        if (!entry) {
            return;
        }
        const {id, item} = entry;
        try {
            if (isCancelled) {
                return;
            }
            result[id] = await item();
        } catch (error) {
            throw error;
        } finally {
            await runWorker();
        }
    };

    (async () => {
        if (beforeWorkerStarts) {
            try {
                await beforeWorkerStarts();
            } catch (error) {
                rejectDone!(error);
                return;
            }
        }

        const workerPool = [];
        for (let i = 0; i < concurrencyLimit; i++) {
            workerPool.push(runWorker());
        }

        Promise.all(workerPool)
            .then(() => resolveDone(result))
            .catch((error) => {
                if (!isCancelled) {
                    rejectDone(error);
                }
            });
    })();

    return {
        done,
        cancel,
        isCancelled: () => isCancelled
    };
}

class CancellationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CancellationError';
    }
}
