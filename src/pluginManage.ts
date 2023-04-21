// @ts-nocheck

import { incPluginDownload } from "./analyze";
import { getSetting, setSetting } from './utils';

export const getBaseURL = () => {
	const option = getSetting('source', 'gitee');
	if (option === 'gitee') {
		return "https://gitee.com/microblock/BetterNCMPluginsMarketData/raw/master/";
	} else if (option === 'github_usercontent') {
		return "https://raw.githubusercontent.com/BetterNCM/BetterNCM-Packed-Plugins/master/";
	} else if (option === 'github_raw') {
		return "https://github.com/BetterNCM/BetterNCM-Packed-Plugins/raw/master/";
	} else if (option === 'custom') {
		return getSetting('custom-source', '');
	}
}

export async function installPlugin(plugin, onlinePlugins) {
    incPluginDownload(plugin.slug, plugin.version);

	console.log(`正在安装插件 ${plugin.slug}...`);
    
	for (let requirement of (plugin.requirements ?? [])) {
		//if (loadedPlugins[requirement]) continue;
		console.log(requirement);
		if (loadedPlugins[requirement]?.version == onlinePlugins.find(plugin => plugin.slug === requirement)?.version) continue;
		let requiredPlugin = onlinePlugins.find(plugin => plugin.slug === requirement);
		if (requiredPlugin) {
			const result = await installPlugin(requiredPlugin, onlinePlugins);
			if (result != "success") return result;
		} else {
			return `${plugin.name} 的依赖 ${requiredPlugin} 解析失败！插件将不会安装`;
		}
	}

	await betterncm.fs.writeFile("./plugins/" + plugin.file, await (await fetch(plugin.source + plugin['file-url'])).blob());

	return "success";
}

export const getDependencies = (plugin, onlinePlugins) => {
	let dependencies = [];

	for (let requirement of (plugin.requirements ?? [])) {
		let requiredPlugin = onlinePlugins.find(plugin => plugin.slug === requirement);
		if (requiredPlugin) {
			//if (requiredPlugin.installed) continue;
			dependencies.push(requirement);
			let result = getDependencies(requiredPlugin, onlinePlugins);
			if (result == null) {
				return null;
			}
			dependencies = dependencies.concat(result);
		} else {
			return dependencies;
		}
	}

	return dependencies;
}


export async function deletePlugin(plugin) {
	if (!loadedPlugins[plugin.slug]) {
		if (await betterncm.fs.exists("./plugins/" + plugin.file)) {
			await betterncm.fs.remove("./plugins/" + plugin.file);
			return "success";
		}
		return "插件未安装";
	}
	let path = await betterncm.fs.readFileText(loadedPlugins[plugin.slug].pluginPath + "/.plugin.path.meta");
	if (path) {
		await betterncm.fs.remove(path);
		return "success";
	}
	return "未找到插件路径，卸载失败";
}

export const fetchAbortController = new class {
	constructor() {
		this.controller = new AbortController();
		this.abort = this.abort.bind(this);
	}
	abort() {
		this.controller.abort();
		this.controller = new AbortController();		
	}
}

const urlCache = {};
const requestPluginsFromUrl = async (url, fromCache = false) => {
	if (fromCache && urlCache[url]) {
		return urlCache[url];
	}
	let response = await fetch(url + "plugins.json?" + new Date().getTime(), {
		signal: fetchAbortController.controller.signal,
	});
	if (response.ok) {
		const json = await response.json();
		response.parsedJson = json;
		urlCache[url] = response;
	}
	return response;
}

export const loadOnlinePlugins = async (updatedUrls = undefined) => {
	// if updatedUrls is undefined, all urls will be requested
	// or else, only the urls in updatedUrls will be requested

	let urls = [getBaseURL()];
	urls = urls.concat(JSON.parse(getSetting('additional-sources', '[]')).filter(url => urls.indexOf(url) === -1));
	urls = urls.concat((window.pluginMarketTemporaryAdditionalSources ?? []).filter(url => urls.indexOf(url) === -1));

	const responses = await Promise.all(urls.map(url => 
		requestPluginsFromUrl(
			url,
			updatedUrls == undefined ? false : !updatedUrls.includes(url)
		)
	));

	let errorText = '';
	for (let response of responses) {
		if (!response.ok) {
			errorText += `Requesting ${response.url.replace(/\?\d+$/, '')} failed: ${response.status} ${response.statusText}\n`
		}
	}
	if (errorText) {
		throw new Error(errorText);
	}

	const jsons = await Promise.all(responses.map(response => response.parsedJson));

	let plugins = [];
	for (let [index, json] of jsons.entries()) {
		for (let plugin of json) {
			if (plugins.find(p => p.slug === plugin.slug)) {
				console.warn(`Duplicate plugin ${plugin.slug} found in ${urls[index]} with the plugin in ${plugins.findIndex(p => p.slug === plugin.slug).source}`);
				continue;
			}
			plugin.source = urls[index];
			plugins.push(plugin);
		}
	}

	plugins.forEach(plugin => {
		(plugin?.incompatible ?? []).forEach(incompatible => {
			const incompatiblePlugin = plugins.find(plugin => plugin.slug === incompatible);
			if (incompatiblePlugin) {
				if (!incompatiblePlugin.incompatible) incompatiblePlugin.incompatible = [];
				if (!incompatiblePlugin.incompatible.includes(plugin.slug)) incompatiblePlugin.incompatible.push(plugin.slug);
			}
		});
	});

	return plugins;
}

export async function openDevFolder(plugin) {
	if (!loadedPlugins[plugin.slug]) {
		return;
	}
	betterncm.app.exec(
		`explorer "${loadedPlugins[plugin.slug].pluginPath.replace(/\//g, "\\").replace("./", "")}"`,
		false,
		true,
	);
}

export function calcBonusDownloads(plugin, pluginsAnalyzeData) {
	const maxDownloads = Math.max(...Object.values(pluginsAnalyzeData));

	const turningPoint = 100; // hours
	const turningValue = 0.85;

	if (!plugin.publish_time) return 0;

	let hours = (new Date().getTime() - plugin.publish_time * 1000) / 1000 / 60 / 60;
	hours = Math.max(0, hours);

	return parseInt((() => {
		// https://www.desmos.com/calculator/wzzpkgmwdh	
		if (hours < turningPoint) {
			return Math.pow((turningPoint - hours) / turningPoint, 6) * (1 - turningValue) + turningValue;
		} else {
			return turningValue * Math.pow(0.99, hours - turningPoint);
		}
	})() * maxDownloads);
}