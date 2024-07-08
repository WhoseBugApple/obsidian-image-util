// help you to 'execute a callback-of-promise after last promise'
export class SeriallyExecutor_ForPromise {
	private lastPromiseOrNull: Promise<void> | null = null;

	setLastPromise(newLast: Promise<void>) {
		this.lastPromiseOrNull = newLast;
	}

	// if last is null, execute now
	executeAfter_lastPromiseOrNull_async(
				resolve: (value: void | PromiseLike<void>) => void, 
				reject: (reason: any) => void, 
				callback: (
						resolve: (value: void | PromiseLike<void>) => void, 
						reject: (reason: any) => void
					) => void
				) {
		try {
			if (this.lastPromiseOrNull) {
				var last = this.lastPromiseOrNull;
				// last.then(
				// 	// after last, do my stuff
				// 	() => {
				// 		callback(resolve, reject);
				// 	}
				// ).catch(
				// 	// after last, do my stuff
				// 	() => {
				// 		callback(resolve, reject);
				// 	}
				// );
				last.finally(
					() => {
						callback(resolve, reject);
					}
				);
			} else {
				// do my stuff
				callback(resolve, reject);
			}
		} catch (e) {
			reject(e);
		}
	}

	// executeAfter_lastPromiseOrNull_setSelfAsLastPromise_async(
	// 			resolve: (value: void | PromiseLike<void>) => void, 
	// 			reject: (reason: any) => void, 
	// 			callback_async: (
	// 					resolve: (value: void | PromiseLike<void>) => void, 
	// 					reject: (reason: any) => void
	// 				) => void, 
	// 			selfPromise: Promise<void>
	// 			) {
	// 	try {
	// 		if (this.lastPromiseOrNull) {
	// 			var last = this.lastPromiseOrNull;
	// 			last.finally(
	// 				() => {
	// 					callback_async(resolve, reject);
	// 				}
	// 			);
	// 		} else {
	// 			// do my stuff
	// 			callback_async(resolve, reject);
	// 		}
	// 	} catch (e) {
	// 		reject(e);
	// 	} finally {
	// 		this.setLastPromise(selfPromise);
	// 	}
	// }
}
