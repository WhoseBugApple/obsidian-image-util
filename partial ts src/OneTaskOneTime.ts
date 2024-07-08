export class OneTaskOneTime {
	private aTaskIsRunning = false;

	knowATaskIsRunning() {
		if (this.aTaskIsRunning)
			throw new Error('already has a running task');
		this.aTaskIsRunning = true;
	}

	knowThatTaskEnd() {
		if (!this.aTaskIsRunning)
			throw new Error('NOT know a task start, but know that task end');
		this.aTaskIsRunning = false;
	}

	alreadyHasOneRunningTask(): boolean {
		return this.aTaskIsRunning;
	}
}
