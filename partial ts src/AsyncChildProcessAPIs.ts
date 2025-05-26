import {ExecException, exec, spawn, ChildProcessWithoutNullStreams} from 'child_process';
import {SharedAPIs} from "./SharedAPIs";

export class ProcessOutput {
	public readonly stdout: string;
	public readonly stderr: string;

	constructor(stdout: string, stderr: string) {
		this.stdout = stdout;
		this.stderr = stderr;
	}
}

export class AsyncChildProcessAPIs {
	public readonly sharedAPIs: SharedAPIs;

	constructor(sharedAPIs: SharedAPIs) {
		this.sharedAPIs = sharedAPIs;
	}

	async exec_async(command: string): Promise<ProcessOutput> {
		return new Promise<ProcessOutput>((resolve, reject) => {
			exec(command, (error: ExecException, stdout: string, stderr: string) => {
				try {
					if (error) {
						reject(error);
						return;
					}
					let execResult = new ProcessOutput(stdout, stderr);
					resolve(execResult);
				} catch (e) {
					reject(e);
				}
			});
		});
	}

	// no need for " around parameter
	async spawn_async(executable: string, args: string[]): Promise<ProcessOutput> {
		return new Promise<ProcessOutput>((resolve, reject) => {
			const child: ChildProcessWithoutNullStreams = spawn(executable, args);
			let stdout = '';
			let stderr = '';

			child.stdout.on('data', (data: Buffer) => {
				stdout += data.toString();
			});

			child.stderr.on('data', (data: Buffer) => {
				stderr += data.toString();
			});

			child.on('close', (code: number) => {
				if (code !== 0) {
					reject(new Error(`Spawn process exited with code ${code}`));
				} else {
					resolve(new ProcessOutput(stdout, stderr));
				}
			});

			child.on('error', (error: Error) => {
				reject(error);
			});
		});
	}
}
