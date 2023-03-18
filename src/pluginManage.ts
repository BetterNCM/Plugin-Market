// @ts-nocheck

import { incPluginDownload } from "./analyze";

export const baseURL = "https://gitee.com/microblock/BetterNCMPluginsMarketData/raw/master/";

export async function installPlugin(plugin, onlinePlugins) {
    incPluginDownload(plugin.slug, plugin.version);

	console.log(`正在安装插件 ${plugin.slug}...`);
    
	for (let requirement of (plugin.requirements ?? [])) {
		//if (loadedPlugins[requirement]) continue;
		if (loadedPlugins[requirement]?.version == onlinePlugins.find(plugin => plugin.slug === requirement).version) continue;
		let requiredPlugin = onlinePlugins.find(plugin => plugin.slug === requirement);
		if (requiredPlugin) {
			const result = await installPlugin(requiredPlugin, onlinePlugins);
			if (result != "success") return result;
		} else {
			return `${plugin.name} 的依赖 ${requiredPlugin} 解析失败！插件将不会安装`;
		}
	}

	await betterncm.fs.writeFile("./plugins/" + plugin.file, await (await fetch(baseURL + plugin['file-url'])).blob());

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

export const loadOnlinePlugins = async () => {
	const json = await (await fetch(baseURL + "plugins.json?" + new Date().getTime())).json();
	json.forEach(plugin => {
		(plugin?.incompatible ?? []).forEach(incompatible => {
			const incompatiblePlugin = json.find(plugin => plugin.slug === incompatible);
			if (incompatiblePlugin) {
				if (!incompatiblePlugin.incompatible) incompatiblePlugin.incompatible = [];
				if (!incompatiblePlugin.incompatible.includes(plugin.slug)) incompatiblePlugin.incompatible.push(plugin.slug);
			}
		});
	});
	return json;
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