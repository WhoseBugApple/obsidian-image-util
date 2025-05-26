import {ObsidianAPIs} from './ObsidianAPIs';
import {Stats, access, readFile, rename, stat} from 'fs';
import {App, Notice} from 'obsidian';
import {basename, dirname, extname, join, normalize, parse, sep} from 'path';
import {AsyncChildProcessAPIs} from "./AsyncChildProcessAPIs";

export class SharedAPIs {
	public readonly obsidianAPIs: ObsidianAPIs;
	public readonly asyncChildProcessAPIs: AsyncChildProcessAPIs;

	constructor(app: App) {
		this.obsidianAPIs = new ObsidianAPIs(app, this);
		this.asyncChildProcessAPIs = new AsyncChildProcessAPIs(this);
	}

	reportLog(message: string, throwError: boolean = true, toastsNotice: boolean = true, logConsole: boolean = true, logConsoleTrace: boolean = false) {
		if (logConsole) {
			console.log('=========== Report Start ===========');
			console.log(message);
			if (logConsoleTrace) console.trace();
		}
		if (toastsNotice) {
			new Notice(message);
			if (logConsole && logConsoleTrace) new Notice('see more log in console, \n' + 'Ctrl+Shift+I to open console');
		}
		if (throwError)
			throw new Error(message);
	}

	getPathSeparator_OSView(): string {
		return sep;
	}

	normalizePath_OSView(path: string): string {
		return normalize(path);
	}

	getParentPath_OSView(path: string): string {
		return dirname(path);
	}

	isSamePath_OSView(path1: string, path2: string): boolean {
		path1 = this.normalizePath_OSView(path1);
		path2 = this.normalizePath_OSView(path2);
		var sep = this.getPathSeparator_OSView();
		if (path1.endsWith(sep)) path1 = path1.substring(0, path1.length - sep.length);
		if (path2.endsWith(sep)) path2 = path2.substring(0, path2.length - sep.length);
		return path1 == path2;
	}

	getName_OSView(path: string): string {
		return basename(path);
	}

	getPrefixName_OSView(path: string): string {
		return parse(path).name;
	}

	getSuffixName_OSView(path: string): string {
		return extname(path);
	}

	// 123.png -> '.png'
	// 123. -> ''
	// 123 -> ''
	getDotStartSuffixName_OSView(path: string): string {
		let suffixName = this.getSuffixName_OSView(path);
		if (suffixName == '' || suffixName == '.') return '';
		if (!suffixName.startsWith('.')) suffixName = '.' + suffixName;
		return suffixName;
	}

	// 123.png -> 'png'
	// 123. -> ''
	// 123 -> ''
	getNonDotStartSuffixName_OSView(path: string): string {
		let suffixName = this.getSuffixName_OSView(path);
		if (suffixName == '' || suffixName == '.') return '';
		if (suffixName.startsWith('.')) suffixName = suffixName.substring(1);
		return suffixName;
	}

	// result is normalized
	concatPath_OSView(pathParts: string[]): string {
		if (pathParts.length == 0) {
			this.reportLog('zero args', true, false, true);
			throw new Error('report error');
		}
		if (pathParts.length == 1) {
			return this.normalizePath_OSView(pathParts[0]);
		}
		var path = pathParts[0];
		for (var i = 1; i < pathParts.length; i++) {
			path = join(path, pathParts[i]);
		}
		return path;
	}

	// separate str to lines
	strToLines(str: string, removeSeparatorFromLines: boolean = true, separators: string[] = ['\r\n', '\n']): string[] {
		// sort sep from long to short
		separators.sort((sep1, sep2) => {
			return sep1.length - sep2.length;
		});
		return this.strToLinesBody(str, 0, separators, removeSeparatorFromLines);
	}

	// separate str-from-a-index to lines
	private strToLinesBody(str: string, strStartIdx: number, separators: string[], removeSeparator: boolean, lines: string[] = []): string[] {
		// try to find next sep in each substr
		var isFoundSep = false;
		var prefix = '';  // includes sep or NOT, depends
		var theFoundSep = '';
		var suffixStartIdx = -1;  // NOT includes sep
		for (var i = strStartIdx; i < str.length; i++) {
			// each substr, is the str starts from i
			// is there a sep?
			for (var j = 0; j < separators.length; j++) {
				// each sep
				var sep = separators[j];
				if (str.startsWith(sep, i)) {
					var sepStartIdx = i;
					var sepEndIdxExclusive = sepStartIdx + sep.length;
					isFoundSep = true;
					if (removeSeparator)
						prefix = str.substring(strStartIdx, sepStartIdx);
					else
						prefix = str.substring(strStartIdx, sepEndIdxExclusive);
					theFoundSep = sep;
					suffixStartIdx = sepEndIdxExclusive;
					break;
				}
			}
			if (isFoundSep) break;
		}

		// if NOT found next sep then
		if (!isFoundSep) {
			lines.push(str.substring(strStartIdx));
			return lines;
		}

		// found the sep
		lines.push(prefix);
		return this.strToLinesBody(str, suffixStartIdx, separators, removeSeparator, lines);
	}

	linesToStr(strArr: string[], addSeparatorToLines: boolean = true, separator: string = '\n'): string {
		var combined = '';
		if (addSeparatorToLines) {
			strArr.forEach((str, idx) => {
				if (idx == 0)
					combined += str;
				else
					combined += separator + str;
			})
		} else {
			strArr.forEach((str) => {
				combined += str;
			})
		}
		return combined;
	}

	async moveOrRename_withoutBackLinkUpdate_async(oldPath: string, newPath: string): Promise<void> {
		return new Promise<void>(
			(resolve, reject) => {
				try {
					rename(oldPath, newPath,
						(err) => {
							try {
								if (err) {
									this.reportLog('failed to move or rename', false, false, true);
									reject(err);
									return;
								}
								resolve();
							} catch (e) {
								reject(e);
							}
						}
					);
				} catch (e) {
					reject(e);
				}
			}
		);
	}

	async canAccess_async(path_OSView: string): Promise<boolean> {
		return new Promise<boolean>(
			(resolve, reject) => {
				access(path_OSView, (err) => {
					try {
						if (err) {
							this.reportLog(`can NOT access ${path_OSView}`, false, false, true);
							resolve(false);
							return;
						}
						resolve(true);
					} catch (e) {
						reject(e);
					}
				});
			}
		);
	}

	async exist_async(path_OSView: string): Promise<boolean> {
		return await this.canAccess_async(path_OSView);
	}

	async getStats_async(path_OSView: string): Promise<Stats> {
		return new Promise<Stats>(
			(resolve, reject) => {
				stat(path_OSView,
					(err, stats: Stats) => {
						try {
							if (err) {
								this.reportLog(`can NOT get stats for ${path_OSView}`, false, false, true);
								reject(err);
								return;
							}
							resolve(stats);
						} catch (e) {
							reject(e);
						}
					})
			}
		);
	}

	async getSize_async(path_OSView: string): Promise<number> {
		return (await this.getStats_async(path_OSView)).size;
	}

	async getByteArray_async(path_OSView: string): Promise<Buffer> {
		return new Promise<Buffer>(
			(resolve, reject) => {
				readFile(path_OSView,
					(err, data: Buffer) => {
						try {
							if (err) {
								this.reportLog(`can NOT read file ${path_OSView}`, true, false, true);
								reject(err);
								return;
							}

							resolve(data);
						} catch (e) {
							reject(e);
						}
					});
			}
		);
	}

	byteArrayToArrayBuffer(buffer: Buffer): ArrayBuffer {
		var arrayBuffer = new ArrayBuffer(buffer.length);
		var byteView = new DataView(arrayBuffer);
		for (var i = 0; i < buffer.length; ++i) {
			byteView.setUint8(i, buffer.readUint8(i));
		}
		return arrayBuffer;
	}

	async readBytes_async(path_OSView: string): Promise<ArrayBuffer> {
		var buffer = await this.getByteArray_async(path_OSView);
		return this.byteArrayToArrayBuffer(buffer);
	}

	async successAfterMs_async(interval_ms: number): Promise<void> {
		return new Promise<void>(
			(resolve, reject) => {
				setTimeout(() => {
					try {
						resolve();
					} catch (e) {
						reject(e);
					}
				}, interval_ms);
			}
		);
	}

	async waitMs_async(interval_ms: number): Promise<void> {
		return await this.successAfterMs_async(interval_ms);
	}
}
