import {PluginAPIs} from "./PluginAPIs";
import {ProcessOutput} from "./AsyncChildProcessAPIs";
import {TFile} from "obsidian";

export class FFmpegCreateFileOutput {
	public readonly processOutput: ProcessOutput;
	public readonly createdFilePath: string;

	constructor(processOutput: ProcessOutput, createdFilePath: string) {
		this.processOutput = processOutput;
		this.createdFilePath = createdFilePath;
	}
}

export class CantFindFFmpegError extends Error {
	public readonly reason: string | undefined;

	constructor(reason?: string) {
		super(`cant find ffmpeg${reason ? ' because: ' + reason : ''}`);
		this.reason = reason;
	}
}

export class CantFindOutputError extends Error {
	public readonly reason: string | undefined;

	constructor(reason?: string) {
		super(`cant find output file${reason ? ' because: ' + reason : ''}`);
		this.reason = reason;
	}
}

export class FFmpegInvalidParameterError extends Error {
	public readonly which?: string;
	public readonly expect?: string;
	public readonly given?: string;

	constructor(which?: string, expect?: string, given?: string) {
		super(`ffmpeg invalid parameter
			${which ? ' <' + which + '>' : ''}
			${expect ? ' expect <' + which + '>' : ''}
			${given ? ' given <' + given + '>' : ''}
			`);
		this.which = which;
		this.expect = expect;
		this.given = given;
	}
}

export class FFmpegAPIs {
	private readonly pluginAPIs: PluginAPIs;
	private readonly exeName: string = 'ffmpeg.exe';

	constructor(pluginAPIs: PluginAPIs) {
		this.pluginAPIs = pluginAPIs;
	}

	async trySpawnFFmpeg(args: string[]): Promise<ProcessOutput | Error> {
		try {
			if (!await this.canFindFFmpeg()) throw new CantFindFFmpegError();
			const ffmpegPath = this.getFFmpegFullPath();
			return this.pluginAPIs.sharedAPIs.asyncChildProcessAPIs.spawn_async(ffmpegPath, args);
		} catch (e) {
			return e;
		}
	}

	validAVIFCRF(crf: string): boolean {
		if (crf.match(/[^0-9]/)) return false;
		const crfInt: number = Number.parseInt(crf);
		return this.validAVIFCRF2(crfInt);
	}

	private validAVIFCRF2(crf: number): boolean {
		if (!Number.isInteger(crf)) return false;
		return crf >= 0 || crf <= 63;
	}

	async trySpawnFFmpeg_createAVIF_libaom(image: TFile, crf: number): Promise<FFmpegCreateFileOutput | Error> {
		try {
			if (!await this.canFindFFmpeg()) throw new CantFindFFmpegError();
			const ffmpegPath = this.getFFmpegFullPath();
			if (!this.validAVIFCRF2(crf)) throw new FFmpegInvalidParameterError('crf', 'int[0,63]', crf.toString());
			const imagePath = this.pluginAPIs.sharedAPIs.obsidianAPIs.getFilePath_OSView(image);
			const crfText = crf.toString();
			const imageNamePrefix = this.pluginAPIs.sharedAPIs.getPrefixName_OSView(imagePath);
			const imageDirPath = this.pluginAPIs.sharedAPIs.getParentPath_OSView(imagePath);
			const outputFilePath = this.pluginAPIs.sharedAPIs.concatPath_OSView(
				[
					imageDirPath,
					imageNamePrefix + '-ffmpeg' + '-avif' + `-${crfText}` + this.pluginAPIs.settingsAPIs.getReadonlyMark() + '.avif'
				]
			);
			const args: string[] = [
				'-nostdin', '-y',
				'-i', imagePath,
				'-c:v', 'libaom-av1',
				'-still-picture', '1',
				'-crf', crfText,
				'-cpu-used', '8',
				outputFilePath
			];
			const processOutput = await this.pluginAPIs.sharedAPIs.asyncChildProcessAPIs.spawn_async(ffmpegPath, args);
			// confirm output exist
			const exist: boolean = await this.pluginAPIs.sharedAPIs.exist_async(outputFilePath);
			if (!exist) {
				throw new CantFindOutputError(`NOT clear. the output path is |${outputFilePath}|, but cant find that file`);
			}
			return new FFmpegCreateFileOutput(
				processOutput,
				outputFilePath
			);
		} catch (e) {
			return e;
		}
	}

	async canFindFFmpeg(): Promise<boolean> {
		let t = await this.pluginAPIs.tryIsExecutableExist_async(this.exeName);
		if (typeof t != "boolean") return false;
		return t;
	}

	getFFmpegFullPath(): string {
		let t = this.pluginAPIs.tryGetExecutableFullPath_OSView(this.exeName);
		if (typeof t != "string") throw new CantFindFFmpegError();
		return t;
	}
}
