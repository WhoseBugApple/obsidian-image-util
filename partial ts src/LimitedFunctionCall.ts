import KORCImageUtilPlugin from "main";
import { SharedAPIs } from "./SharedAPIs";

// prevent endless-recursion disaster
// improve the safty of recursion
export class LimitedFunctionCall {
	private plugin: KORCImageUtilPlugin;
	private apis: SharedAPIs;

	constructor(plugin: KORCImageUtilPlugin, maxCalledLimit: number = 20) {
		this.plugin = plugin;
		this.apis = plugin.apis;
		this.maxCalledLimit = maxCalledLimit;
	}

	private hasCalledCount: number = 0;
	private readonly maxCalledLimit: number;
	private onceOverlimit: boolean = false;

	ensureNoEndlessRecursion() {
		if (this.onceOverlimit || this.hasCalledCount >= this.maxCalledLimit) {
			// has reach limit
			if (!this.onceOverlimit) {
				this.onceOverlimit = true;
			}
			this.apis.reportLog(
				`has reach a limit ${this.maxCalledLimit} times compression, \n` + 
				"to avoid endless onCreate() recursion, \n" + 
				"no more compression request will be accept, \n" + 
				"if you want to enable feature again, \n" + 
				"please go to setting, \n" + 
				"disable plugin, then enable again", 
				true, true, true);
			throw new Error('report error');
		} else {
			// hasn't reach limit
			this.hasCalledCount++;
		}
	}
}
