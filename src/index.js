import { compareVersions, satisfies } from 'compare-versions';
import { getPluginDownloads } from './analyze';
import { Icon } from './icons';
import { installPlugin, getDependencies, deletePlugin, loadOnlinePlugins, getBaseURL, openDevFolder, calcBonusDownloads, fetchAbortController } from './pluginManage';
import { formatNumber, formatShortTime, getSetting, setSetting, useRefState } from './utils';
import { Flipper, Flipped } from "react-flip-toolkit";
import './styles.scss'

import selfManifest from './manifest.json';

const setConfig = (key, value) => {
	localStorage.setItem(`pluginmarket-${key}`, JSON.stringify(value));
};
const getConfig = (key, defaultValue) => {
	let value = localStorage.getItem(`pluginmarket-${key}`);
	if (value === null) {
		return defaultValue;
	}
	return JSON.parse(value);
};

plugin.onLoad(()=>{
	plugin.mainPlugin.getMainSource = () => {
		return getBaseURL();
	};
	plugin.mainPlugin.getAdditionalSources = () => {
		return JSON.parse(getSetting('additional-sources', '[]'));
	};
	plugin.mainPlugin.getTemporaryAdditionalSources = () => {
		return window.pluginMarketTemporaryAdditionalSources ?? [];
	};
	plugin.mainPlugin.getAllSources = () => {
		let urls = [getBaseURL()];
		urls = urls.concat(JSON.parse(getSetting('additional-sources', '[]')).filter(url => urls.indexOf(url) === -1));
		urls = urls.concat((window.pluginMarketTemporaryAdditionalSources ?? []).filter(url => urls.indexOf(url) === -1));
		return urls;
	};
	plugin.mainPlugin.addCustomSource = (url, position = -1) => {
		if (!url.match(/^(https?:\/\/)?[\w-]+(\.[\w-]+)+([\w-.,@?^=%&:/~+#]*[\w-@?^=%&/~+#])?$/)) {
			throw new Error('Invalid URL');
		}
		if (!url.endsWith('/')) {
			url += '/';
		}

		const additionalSources = JSON.parse(getSetting('additional-sources', '[]'));
		if (additionalSources.indexOf(url) !== -1) {
			return;
		}
		if (position !== -1) position = Math.min(Math.max(position, 0), additionalSources);
		if (position === -1) {
			additionalSources.push(url);
		} else {
			additionalSources.splice(position, 0, newSource);
		}

		setSetting('additional-sources', JSON.stringify(additionalSources));
		document.dispatchEvent(new CustomEvent('plugin-market-refresh', { detail: {
			url: url
		}}));
		document.dispatchEvent(new CustomEvent('plugin-market-refresh-additional-sources'));
	};
	plugin.mainPlugin.addTemporaryCustomSource = (url) => {
		if (!url.match(/^(https?:\/\/)?[\w-]+(\.[\w-]+)+([\w-.,@?^=%&:/~+#]*[\w-@?^=%&/~+#])?$/)) {
			throw new Error('Invalid URL');
		}
		if (!url.endsWith('/')) {
			url += '/';
		}

		const temporaryAdditionalSources = window.pluginMarketTemporaryAdditionalSources ?? [];
		if (temporaryAdditionalSources.indexOf(url) !== -1) {
			return;
		}
		temporaryAdditionalSources.push(url);
		window.pluginMarketTemporaryAdditionalSources = temporaryAdditionalSources;
		document.dispatchEvent(new CustomEvent('plugin-market-refresh', { detail: {
			url: url
		}}));
		document.dispatchEvent(new CustomEvent('plugin-market-refresh-temporary-additional-sources'));
	};
	plugin.mainPlugin.removeTemporaryCustomSource = (url) => {
		if (!url.endsWith('/')) {
			url += '/';
		}
		
		const temporaryAdditionalSources = window.pluginMarketTemporaryAdditionalSources ?? [];
		const newTemporaryAdditionalSources = temporaryAdditionalSources.filter((s) => s !== url);
		window.pluginMarketTemporaryAdditionalSources = newTemporaryAdditionalSources;

		document.dispatchEvent(new CustomEvent('plugin-market-refresh', { detail: {
			url: null
		}}));
		document.dispatchEvent(new CustomEvent('plugin-market-refresh-temporary-additional-sources'));
	};

	betterncm.utils.waitForElement('#pri-skin-gride').then(ele=>{
		const onThemeUpdate = () => {
			if (!document.querySelector("#skin_default, #skin_less").href.includes("skin.ls.css")) {
				document.body.classList.add("ncm-light-theme");
			} else {
				document.body.classList.remove("ncm-light-theme");
			}
		};
		onThemeUpdate();
		new MutationObserver(() => {
			onThemeUpdate();
		}).observe(ele, { attributes: true });
	});		
});

let currentBetterNCMVersion = await betterncm.app.getBetterNCMVersion();

class PluginList extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			onlinePlugins: null,
			errorMsg: null,
			pluginsAnalyzeData: {},
			requireReload: false,
			requireRestart: false,
			category: 'all',
			search: '',
			sort_by: 'composite',
			sort_order: 'desc',
			devOptions: getConfig('devOptions', false),
			showLibsTab: getConfig('showLibsTab', false),
			showVersionUnmatchedPlugins: false,
			showBonusDownloads: false,
		};
		this.requireReload = this.requireReload.bind(this);
		this.setInstalled = this.setInstalled.bind(this);
		this.setHasUpdate = this.setHasUpdate.bind(this);
		this.updateNotificationBadge = this.updateNotificationBadge.bind(this);
	}

	async componentDidMount() {
		this.init();
		this.props.refresh.current = (updatedUrls = null) => {
			fetchAbortController.abort();
			this.setState({
				onlinePlugins: null
			}, () => this.init(false, updatedUrls));
		}
	}

	async init(reloadDownloads = true, updatedUrls = null) {
		this.state.errorMsg = null;
		loadOnlinePlugins(updatedUrls).then(
			onlinePlugins => {
				onlinePlugins = onlinePlugins.map(plugin => {
					plugin.installed = !!loadedPlugins[plugin.slug];
					plugin.hasUpdate = plugin.installed && compareVersions(plugin.version, loadedPlugins[plugin.slug].manifest.version) > 0;
					plugin.type = plugin.type ?? 'extension';
					return plugin;
				}).filter(plugin => !(plugin.deprecated || plugin.hide));
				this.setState({ onlinePlugins });
				this.updateNotificationBadge();
		}).catch(
			error => {
				if (error.message == 'The user aborted a request.') return;
				if (!getBaseURL().match(/^(https?:\/\/)?[\w-]+(\.[\w-]+)+([\w-.,@?^=%&:/~+#]*[\w-@?^=%&/~+#])?$/)) {
					error.message = '请检查插件源地址是否正确\n' + error.message;
				}
				this.setState({ errorMsg: error.message });
			}
		);
		if (!reloadDownloads) return;
		getPluginDownloads().then(
			pluginsAnalyzeData => {
				let dict = {};
				pluginsAnalyzeData.forEach(plugin => {
					dict[plugin.name] = (dict[plugin.name] ?? 0) + plugin.count;
				});
				this.setState({ pluginsAnalyzeData: dict });
			}
		);
	}

	updateNotificationBadge() {		
		if (this.state.onlinePlugins.filter(plugin => plugin.hasUpdate).length) {
			document.body.classList.add('plugins-have-update');
		} else {
			document.body.classList.remove('plugins-have-update');
		}
	}

	setInstalled(slug, installed) {
		let onlinePlugins = this.state.onlinePlugins;
		onlinePlugins.find(plugin => plugin.slug === slug).installed = installed;
		this.setState({ onlinePlugins }, () => this.resetCategorySelection());
	}

	setHasUpdate(slug, hasUpdate) {
		let onlinePlugins = this.state.onlinePlugins;
		onlinePlugins.find(plugin => plugin.slug === slug).hasUpdate = hasUpdate;
		this.setState({ onlinePlugins }, () => this.resetCategorySelection());
	}

	resetCategorySelection() {
		if (this.state.category == 'installed' && !this.state.onlinePlugins.filter(plugin => plugin.installed).length) {
			this.setState({ category: 'all' });
		}
		if (this.state.category == 'update' && !this.state.onlinePlugins.filter(plugin => plugin.hasUpdate).length) {
			this.setState({ category: 'all' });
		}
	}

	requireReload(requireRestart = false) {
		this.setState({
			requireReload: true,
			requireRestart: (requireRestart || this.state.requireRestart)
		});
	}

	setSortBy(sort_by) {
		if (this.state.sort_by === sort_by) {
			this.setState({
				sort_order: (this.state.sort_order === 'asc' ? 'desc' : 'asc')
			});
		} else {
			this.setState({
				sort_by,
				sort_order: sort_by === 'name' ? 'asc' : 'desc'
			});
		}
	}


	render() {
		if (!this.state.onlinePlugins) {
			if (this.state.errorMsg) {
				return <div className="plugin-market-container loading error">
					<Icon name="warning" />
					<div>加载失败</div>
					{
						this.state.errorMsg.split('\n').map((line, i) => <div key={i}>{line}</div>)
					}
					<div className="error-actions">
						<button onClick={() => {
							this.setState({
								onlinePlugins: null,
								pluginsAnalyzeData: {}
							}, () => this.init());
						}}>重试</button>
						<button className="settings" onClick={() => {
							this.props.openSettings();
						}}>设置</button>
					</div>
						
				</div>;
			}
			return <div className="plugin-market-container loading">
				<Icon name="loading" className="spinning" />
				<div>加载插件中...</div>
				<div className="loading-actions">
					<button className="settings" onClick={() => {
						this.props.openSettings();
					}}>设置</button>
				</div>
			</div>;
		}

		const filteredPlugins = this.state.onlinePlugins
			.filter(
				plugin => {
					if (plugin.deprecated || plugin.hide) return false;
					if (!plugin.betterncm_version) return true;
					return satisfies(currentBetterNCMVersion, plugin.betterncm_version) || this.state.showVersionUnmatchedPlugins;
				}
			)
			.filter(
				plugin => {
					if (this.state.category === 'all') return !(['lib', 'library', 'dependency', 'framework'].includes(plugin.type));
					if (this.state.category === 'installed') return plugin.installed;
					if (this.state.category === 'update') return plugin.hasUpdate;
					if (this.state.category === 'lib') return ['lib', 'library', 'dependency', 'framework'].includes(plugin.type);
					return this.state.category == (plugin.type ?? 'extension');
				}
			)
			.filter(
				plugin => {
					if (!this.state.search) return true;
					const name = plugin.name.toLowerCase();
					const slug = plugin.slug.toLowerCase();
					const author = plugin.author.toLowerCase();
					return this.state.search.toLowerCase().trim().split(' ').every(
						(s) => {
							if (s.startsWith('author:')) {
								return author.includes(s.slice(7));
							}
							return name.includes(s) || slug.includes(s) || author.includes(s);
						}
					);
				}
			)
			.sort((a, b) => {
				if (['lib', 'library', 'dependency', 'framework'].includes(a.type) ^ ['lib', 'library', 'dependency', 'framework'].includes(b.type)) {
					return ['lib', 'library', 'dependency', 'framework'].includes(a.type) ? 1 : -1;
				}
				return (() => {
					switch (this.state.sort_by) {
						case 'composite':
							if (Object.keys(this.state.pluginsAnalyzeData).length !== 0) {
								return (
									((this.state.pluginsAnalyzeData[a.slug] ?? 0) + calcBonusDownloads(a, this.state.pluginsAnalyzeData))
									- 
									((this.state.pluginsAnalyzeData[b.slug] ?? 0) + calcBonusDownloads(b, this.state.pluginsAnalyzeData))
								);
							} else {
								return (a.stars ?? 0) > (b.stars ?? 0) ? 1 : -1;
							}
						case 'downloads':
							if (Object.keys(this.state.pluginsAnalyzeData).length !== 0) {
								return (this.state.pluginsAnalyzeData[a.slug] ?? 0) - (this.state.pluginsAnalyzeData[b.slug] ?? 0)
							} else {
								return (a.stars ?? 0) > (b.stars ?? 0) ? 1 : -1;
							}
						case 'stars':
							return (a.stars ?? 0) > (b.stars ?? 0) ? 1 : -1;
						case 'name':
							return a.name > b.name ? 1 : -1;
						case 'update':
							return a.update_time - b.update_time;
					}
				})() * (this.state.sort_order === 'asc' ? 1 : -1)
			});

		return (
			<div>
				<div className="plugin-market-filters">
					<div className="plugin-market-filter-category">
						<button className={this.state.category === 'all' ? 'active' : ''} onClick={(e) => {
							if (e.shiftKey) {
								this.setState({
									onlinePlugins: null,
									pluginsAnalyzeData: {}
								}, () => this.init());
							}
							this.setState({ category: 'all' })
						}}>全部</button>
						<button className={this.state.category === 'extension' ? 'active' : ''} onClick={() => this.setState({ category: 'extension' })}>扩展</button>
						<button className={this.state.category === 'theme' ? 'active' : ''} onClick={() => this.setState({ category: 'theme' })}>主题</button>
						{this.state.showLibsTab && this.state.devOptions && <button className={this.state.category === 'lib' ? 'active' : ''} onClick={() => this.setState({ category: 'lib' })}>依赖库</button>}
						{this.state.onlinePlugins.filter(plugin => plugin.installed).length > 0 && <button className={this.state.category === 'installed' ? 'active' : ''} onClick={() => this.setState({ category: 'installed' })}>已安装</button>}
						{this.state.onlinePlugins.filter(plugin => plugin.hasUpdate).length > 0 && <button className={`has-update ${this.state.category === 'update' ? 'active' : ''}`} onClick={() => this.setState({ category: 'update' })}>有更新</button>}
						<button className='settings' onClick={() => this.props.openSettings()}><Icon name='settings'/></button>
					</div>
					<div className={`plugin-market-filter-search ${this.state.search ? 'filled' : ''}`}>
						<Icon name="search" />
						<input placeholder="搜索..." onChange={e => this.setState({ search: e.target.value })} />
					</div>
					<div className="plugin-market-filter-sort">
						<button title="综合" className={`${this.state.sort_by === 'composite' ? 'active' : ''} ${this.state.sort_order}`} onClick={() => this.setSortBy('composite')}><Icon name="chart" /></button>
						{Object.keys(this.state.pluginsAnalyzeData).length !== 0 && <button title="下载量" className={`${this.state.sort_by === 'downloads' ? 'active' : ''} ${this.state.sort_order}`} onClick={() => this.setSortBy('downloads')}><Icon name="download" /></button>}
						<button title="Star 数" className={`${this.state.sort_by === 'stars' ? 'active' : ''} ${this.state.sort_order}`} onClick={() => this.setSortBy('stars')}><Icon name="star" /></button>
						<button title="更新时间" className={`${this.state.sort_by === 'update' ? 'active' : ''} ${this.state.sort_order}`} onClick={() => this.setSortBy('update')}><Icon name="clock" /></button>
						<button title="名称" className={`${this.state.sort_by === 'name' ? 'active' : ''} ${this.state.sort_order}`} onClick={() => this.setSortBy('name')}><Icon name="atoz" /></button>
					</div>
				</div>
    			<Flipper
					flipKey={filteredPlugins.map(plugin => plugin.slug).join('')}
					staggerConfig={{
						default: {
							speed: 1000
						}
					}}
					spring={{
						stiffness: 322,
						damping: 32
					}}
				>
					<div className="plugin-market-container">
							{
								filteredPlugins.map((plugin) => {
									return <React.Fragment key={plugin.slug}>
										<Flipped
											key={plugin.slug}
											flipId={plugin.slug}
											/*stagger*/
											onAppear={(el, index) => {
												el.animate([
													{ opacity: 0, transform: 'scale(0.9)' },
													{ opacity: 1, transform: 'scale(1)' }
												], {
													duration: 150,
													easing: 'ease-out'
												}).onfinish = () => el.style = '';
											}}
											onExit={(el, index, removeElement) => {
												el.animate([
													{ opacity: 1, transform: 'scale(1)' },
													{ opacity: 0, transform: 'scale(0.9)' }
												], {
													duration: 150,
													easing: 'ease-out'
												}).onfinish = () => removeElement();
											}}
										>
											{
												flippedProps => 
												<PluginItem
													key={plugin.slug}
													downloads={this.state.pluginsAnalyzeData[plugin.slug] ?? 0}
													plugin={plugin}
													onlinePlugins={this.state.onlinePlugins}
													requireReload={this.requireReload}
													setInstalled={this.setInstalled}
													setHasUpdate={this.setHasUpdate}
													updateNotificationBadge={this.updateNotificationBadge}
													pluginsAnalyzeData={this.state.pluginsAnalyzeData}
													showBonusDownloads={this.state.showBonusDownloads}
													flippedProps={flippedProps}
												/>
											}
										</Flipped>
									</React.Fragment>
								})
							}
					</div>
				</Flipper>
				{
					this.state.requireReload ?
						<div className="reload-notice">
							<div>插件的更改需要{ this.state.requireRestart ? '重启' : '重载' }以生效</div>
							<button onClick={async () => {
								this.state.requireRestart ? await betterncm_native.app.restart() : await betterncm.app.reloadPlugins();
								betterncm.reload()
							}}><Icon name="reload" /> { this.state.requireRestart ? '重启' : '重载' }</button>
						</div>
						: null
				}
				<div className={`plugin-market-dev-options ${this.state.devOptions ? 'active' : ''}`}>
					<div className="plugin-market-dev-options-switch md-switch">
						<label className="label">开发者选项</label>
						<input type="checkbox" id="dev-options" checked={this.state.devOptions} onChange={e => {
							setConfig('devOptions', e.target.checked);
							this.setState({
								devOptions: e.target.checked
							});
						}} />
						<label htmlFor="dev-options" className="toggle"><span></span></label>
					</div>
					<div className="plugin-market-dev-options-content" style={{ display: this.state.devOptions ? 'block' : 'none' }}>
						<div className="md-switch">
							<label className="label">显示"依赖库"分类</label>
							<input type="checkbox" id="show-libs-tab" checked={this.state.showLibsTab} onChange={e => {
								setConfig('showLibsTab', e.target.checked);
								this.setState({
									showLibsTab: e.target.checked
								});
							}} />
							<label htmlFor="show-libs-tab" className="toggle"><span></span></label>
						</div>
						<div className="md-switch">
							<label className="label">显示与 BetterNCM 版本不匹配的插件</label>
							<input type="checkbox" id="show-version-unmatched-plugins" checked={this.state.showVersionUnmatchedPlugins} onChange={e => {
								this.setState({
									showVersionUnmatchedPlugins: e.target.checked
								});
							}} />
							<label htmlFor="show-version-unmatched-plugins" className="toggle"><span></span></label>
						</div>
						<div className="md-switch">
							<label className="label">显示 Bonus 下载量</label>
							<input type="checkbox" id="show-bonus-downloads" checked={this.state.showBonusDownloads} onChange={e => {
								this.setState({
									showBonusDownloads: e.target.checked
								});
							}} />
							<label htmlFor="show-bonus-downloads" className="toggle"><span></span></label>
						</div>
						<div>
							<a className="u-ibtn5 u-ibtnsz8" onClick={() => {
								this.setState({
									onlinePlugins: null,
									pluginsAnalyzeData: {}
								}, () => this.init());
							}}>重载插件列表</a>
							<a className="u-ibtn5 u-ibtnsz8" onClick={() => {
								console.log(this.state.onlinePlugins);
							}}>打印插件列表</a>
							<a className="u-ibtn5 u-ibtnsz8" onClick={() => {
								console.log(this.state.pluginsAnalyzeData);
							}}>打印插件统计数据</a>
							<a className="u-ibtn5 u-ibtnsz8" onClick={() => {
								console.log(loadedPlugins);
							}}>打印已加载插件</a>
						</div>
						<div>
							<a className="u-ibtn5 u-ibtnsz8" onClick={() => {
								betterncm.app.reloadPlugins();
							}}>重载网易云</a>
							<a className="u-ibtn5 u-ibtnsz8" onClick={() => {
								betterncm_native.app.restart();
							}}>重启网易云</a>
						</div>
						<div>版本: {selfManifest.version}</div>
					</div>
				</div>
			</div>
		);
	}
}


class PluginItem extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			installed: false,
			installing: false,
			deleting: false,
			hasUpdate: false,
			requireReload: false
		};
	}

	async componentDidMount() {

	}

	async install(update = false) {
		if (this.state.installing || this.state.deleting) return;
		this.setState({
			installing: true
		});
		if (update) {
			await deletePlugin(this.props.plugin);
		}

		if (this.props.plugin.type === "theme") {
			for (const plugin of this.props.onlinePlugins.filter(plugin => plugin.type === "theme")) {
				await deletePlugin(plugin);
				this.props.setInstalled(plugin.slug, false);
			}
		}

		const result = await installPlugin(this.props.plugin, this.props.onlinePlugins);
		if (result == 'success') {
			this.setState({
				installed: true,
				installing: false,
				hasUpdate: false,
				requireReload: true
			});
			this.props.setInstalled(this.props.plugin.slug, true);
			for (const slug of getDependencies(this.props.plugin, this.props.onlinePlugins)) {
				this.props.setInstalled(slug, true);
			}
			this.props.setHasUpdate(this.props.plugin.slug, false);
			this.props.requireReload(!!this.props.plugin.native);
			this.props.updateNotificationBadge();
		} else {
			this.setState({
				installing: false
			});
			console.log(result);
		}
	}

	async delete() {
		if (this.state.installing || this.state.deleting) return;
		this.setState({
			deleting: true
		});
		const result = await deletePlugin(this.props.plugin);
		if (result == 'success') {
			this.setState({
				installed: false,
				deleting: false,
				hasUpdate: false,
				requireReload: true
			});
			this.props.setInstalled(this.props.plugin.slug, false);
			this.props.setHasUpdate(this.props.plugin.slug, false);
			this.props.requireReload(!!this.props.plugin.native);
			this.props.updateNotificationBadge();
		} else {
			this.setState({
				deleting: false
			});
			console.log(result);
		}
	}

	isDev() {
		if (loadedPlugins[this.props.plugin.slug]) {
			return loadedPlugins[this.props.plugin.slug].devMode;
		}
		return false;
	}

	canDelete() {
		if (this.isDev()) return false;
		const installedPlugins = this.props.onlinePlugins.filter(v => v.installed);
		for (const plugin of installedPlugins) {
			if (plugin.requirements?.includes(this.props.plugin.slug)) {
				return false;
			}
		}
		return true;
	}

	beingDependedByList() {
		const list = [];
		const installedPlugins = this.props.onlinePlugins.filter(v => v.installed);
		for (const plugin of installedPlugins) {
			if (plugin.requirements?.includes(this.props.plugin.slug)) {
				list.push(plugin.name);
			}
		}
		return list;
	}

	canInstall() {
		const dependencies = getDependencies(this.props.plugin, this.props.onlinePlugins);
		dependencies.push(this.props.plugin.slug);
		for (const dependency of dependencies) {
			for (const plugin of this.props.onlinePlugins.find(v => v.slug === dependency)?.incompatible ?? []) {
				if (this.props.onlinePlugins.find(v => v.slug === plugin)?.installed) {
					return false;
				}
			}
		}
		return true;
	}

	incompatibleList() {
		const dependencies = getDependencies(this.props.plugin, this.props.onlinePlugins);
		dependencies.push(this.props.plugin.slug);
		const list = [];
		for (const dependency of dependencies) {
			for (const plugin of this.props.onlinePlugins.find(v => v.slug === dependency)?.incompatible ?? []) {
				const onlinePlugin = this.props.onlinePlugins.find(v => v.slug === plugin);
				if (onlinePlugin?.installed) {
					list.push(onlinePlugin.name);
				}
			}
		}
		return [...new Set(list)];
	}

	dependencyList() {
		const dependencies = getDependencies(this.props.plugin, this.props.onlinePlugins);
		const list = [];
		for (const dependency of dependencies) {
			const onlinePlugin = this.props.onlinePlugins.find(v => v.slug === dependency);
			if (onlinePlugin) {
				list.push(onlinePlugin.name);
			}
		}
		return list;
	}


	hasSettings() {
		if (loadedPlugins[this.props.plugin.slug]) {
			return loadedPlugins[this.props.plugin.slug].haveConfigElement();
		}
		return false;
	}

	getActionbarColor() {
		if (this.props.plugin.installed) {
			if (this.props.plugin.hasUpdate) {
				return '#66ccff';
			}
			return '#ccff99';
		} else if (this.state.installing || this.state.deleting) {
			return '#ffcc22';
		}
	}

	getActionbarIconColor() {
		if (this.state.installing || this.state.deleting) {
			return '#000';
		}
		if (!this.props.plugin.installed) {
			return '#ccc';
		}
		return '#3a3a3a';
	}

	getActionButtons() {
		let buttons = [];
		if (this.props.plugin.installed) {
			if (this.isDev()) {
				buttons.push(
					<button className="plugin-action-button" onClick={() => { openDevFolder(this.props.plugin) }}>
						<Icon name="folder" />
					</button>
				);
			}
			if (!this.isDev()){
				buttons.push(
					this.state.deleting ? (
						<button className="plugin-action-button">
							<Icon name="loading" className="spinning" />
						</button>
					) : (
						<button className={`plugin-action-button ${this.canDelete() ? '' : 'disabled'}`} onClick={() => { this.delete() }}>
							<Icon name="delete" />
						</button>
					)
				)
			}
			if (this.hasSettings()) {
				buttons.push(
					<button className="plugin-action-button" onClick={() => { document.querySelector(`.better-ncm-manager .loaded-plugins-list .plugin-btn[data-plugin-slug='${this.props.plugin.slug}']`).click() }}>
						<Icon name="settings" />
					</button>
				)
			}
			if (!this.isDev() && this.props.plugin.hasUpdate) {
				buttons.push(
					this.state.installing ? (
						<button className="plugin-action-button">
							<Icon name="loading" className="spinning" />
						</button>
					) : (
						<button className="plugin-action-button" onClick={() => { this.install(true) }}>
							<Icon name="update" />
						</button>
					)
				)
			}
		} else {
			buttons.push(
				this.state.installing ? (
					<button className="plugin-action-button">
						<Icon name="loading" className="spinning" />
					</button>
				) : (
					<button className={`plugin-action-button ${this.canInstall() ? '' : 'disabled'}`} onClick={() => { this.install() }}>
						<Icon name="download" />
					</button>
				)
			)
		}
		return buttons;
	}


	render() {
		let preview = this.props.plugin.preview ? this.props.plugin.source + this.props.plugin.preview : "unset";
		let authorLink = this.props.plugin['author_link'] ?? (this.props.plugin['author_links'] ?? [])[0] ?? null;
		if (authorLink) {
			if (!authorLink.startsWith('http')) {
				authorLink = 'https://' + authorLink;
			}
			if (!authorLink.match(/^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/)) {
				authorLink = null;
			}
		}
		const showCompatibilityInfo = (!this.canInstall() || this.beingDependedByList().length > 0 || this.dependencyList().length > 0);
		return (
			<div className="plugin-item-wrapper" {...this.props.flippedProps}>
				<div className={`plugin-item ${this.state.installing ? 'installing' : ''} ${this.state.deleting ? 'deleting' : ''} ${showCompatibilityInfo ? 'with-compatibility-info' : ''}`}>
					<div className="plugin-item-preview" style={{ 'backgroundImage': `url(${preview})` }} />
					<div className="plugin-item-body">
						<div className="plugin-item-info">
							<div className="plugin-item-title">{this.props.plugin.name}</div>
							<div className="plugin-item-author">
								{
									authorLink ?
										(<a onClick={async () => {
											await betterncm.app.exec(authorLink)
										}} target="_blank" rel="noreferrer">{this.props.plugin.author}</a>) :
										(<span>{this.props.plugin.author}</span>)
								}
							</div>
							<div className="plugin-item-description">
								{this.props.plugin.description}
							</div>
							<div className="plugin-item-metas">
								{
									this.props.downloads > 0 && !this.props.showBonusDownloads &&
									<span className="plugin-item-meta plugin-downloads" title={`下载量${this.props.downloads >= 1000 ? ` (${this.props.downloads})` : ''}`}><Icon name="download" /><span>{formatNumber(this.props.downloads)}</span></span>
								}
								{
									this.props.showBonusDownloads &&
									<span className="plugin-item-meta plugin-downloads" title={`${this.props.downloads ?? 0}(Downloads) + ${calcBonusDownloads(this.props.plugin, this.props.pluginsAnalyzeData)}(Bonus)`}><Icon name="download" /><span>{formatNumber(this.props.downloads + calcBonusDownloads(this.props.plugin, this.props.pluginsAnalyzeData))}</span></span>
								}

								<span className="plugin-item-meta plugin-item-version" title="版本号">
									{
										this.props.plugin.hasUpdate ?
											(<span><Icon name="has_update" /> {loadedPlugins[this.props.plugin.slug].manifest.version} → <span className='new-version'>{this.props.plugin.version}</span></span>) :
											(<span><Icon name="tag" /> {this.props.plugin.version}</span>)
									}
								</span>

								<span className="plugin-item-meta plugin-item-update-time" title={`最后更新时间 (${new Date(this.props.plugin.update_time * 1000).toLocaleString('zh-cn')})`}>
									<Icon name="clock"/> {formatShortTime(this.props.plugin.update_time)}
								</span>

								{
									this.props.plugin.stars > 0 &&
									<span className="plugin-item-meta plugin-stars" title={`Star 数${this.props.plugin.stars >= 1000 ? ` (${this.props.plugin.stars})` : ''}`}><Icon name="star" /><span>{formatNumber(this.props.plugin.stars)}</span></span>
								}

								{
									this.props.plugin.repo &&
									<span className="plugin-item-meta plugin-github" title="Github">
										<a onClick={async () => { await betterncm.app.exec(`https://github.com/${this.props.plugin.repo}`) }}><Icon name="github"/></a></span>
								}
							</div>
							{preview !== "unset" ? <div className="plugin-item-bg" style={{ 'backgroundImage': `url(${preview})` }} /> : null}
						</div>
					</div>
					<div className="plugin-item-actions" style={{ backgroundColor: this.getActionbarColor(), fill: this.getActionbarIconColor() }}>
						{this.getActionButtons()}
					</div>
					<div className="plugin-item-state-indicator-container">
						{
							this.props.plugin.type === 'extension' ? (
								<div className="plugin-item-state-indicator extension">
									<Icon name="puzzle" />
								</div>
							) : null
						}
						{
							this.props.plugin.type === 'theme' ? (
								<div className="plugin-item-state-indicator theme">
									<Icon name="brush" />
								</div>
							) : null
						}
						{
							['lib', 'library', 'dependency', 'framework'].includes(this.props.plugin.type) ? (
								<div className="plugin-item-state-indicator lib">
									<Icon name="boxes" />
								</div>
							) : null
						}
						{
							this.isDev() ? (
								<div className="plugin-item-state-indicator dev">
									<Icon name="dev" />
								</div>
							) : null
						}
						{
							(new Date().getTime() - (this.props.plugin.publish_time ?? 0) * 1000) < 5 * 24 * 60 * 60 * 1000 ? (
								<div className="plugin-item-state-indicator new">NEW</div>
							) : null
						}
					</div>
				</div>
				{
					( showCompatibilityInfo ) &&
					<div className="plugin-item-compatibility-info">
						{!this.canInstall() && <div class="plugin-item-incompatible-info">与 {this.incompatibleList().join('、')} 不兼容 </div>}
						{this.beingDependedByList().length > 0 && <div class="plugin-item-dependency-info">被 {this.beingDependedByList().join('、')} 依赖</div>}
						{this.dependencyList().length > 0 && <div class="plugin-item-dependency-info">依赖 {this.dependencyList().join('、')}</div>}
					</div>
				}
			</div>
		)
	}
}

function Settings(props) {
	const [source, setSource] = React.useState(getSetting('source', 'gitee'));
	const [customSource, setCustomSource] = React.useState(getSetting('custom-source', ''));

	React.useEffect(() => {
		betterncm.app.writeConfig('cc.microblock.pluginmarket.source', getBaseURL());
	}, [source, customSource]);

	const [additionalSources, setAdditionalSources, _additionalSources] = useRefState(JSON.parse(getSetting('additional-sources', '[]')));
	const additionalSourcesChanged = (changedAdditionalSources) => {
		setAdditionalSources(changedAdditionalSources);
		const filteredSources = changedAdditionalSources.filter((source) => source.match(/^(https?:\/\/)?[\w-]+(\.[\w-]+)+([\w-.,@?^=%&:/~+#]*[\w-@?^=%&/~+#])?$/) !== null);
		setSetting('additional-sources', JSON.stringify(filteredSources));
	};
	
	const [temporaryAdditionalSources, setTemporaryAdditionalSources] = React.useState(window.pluginMarketTemporaryAdditionalSources ?? []);

	React.useEffect(() => {
		const onRefreshAdditionalSources = () => {
			setAdditionalSources(JSON.parse(getSetting('additional-sources', '[]')));
		};
		const onRefreshTemporaryAdditionalSources = () => {
			setTemporaryAdditionalSources([...(window.pluginMarketTemporaryAdditionalSources ?? [])]);
		};
		document.addEventListener('plugin-market-refresh-additional-sources', onRefreshAdditionalSources);
		document.addEventListener('plugin-market-refresh-temporary-additional-sources', onRefreshTemporaryAdditionalSources);
		return () => {
			document.removeEventListener('plugin-market-refresh-additional-sources', onRefreshAdditionalSources);
			document.removeEventListener('plugin-market-refresh-temporary-additional-sources', onRefreshTemporaryAdditionalSources);
		};
	}, []);

	const [customSourceUnlocked, setCustomSourceUnlocked] = React.useState(getSetting('custom-source-unlocked', false));
	const konamiSeq = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
	const currentIndex = React.useRef(0);
	React.useEffect(() => {
		if (customSourceUnlocked) {
			return;
		}
		const onKeyDown = (e) => {
			if (e.keyCode === konamiSeq[currentIndex.current]) {
				currentIndex.current++;
				if (currentIndex.current === konamiSeq.length) {
					setCustomSourceUnlocked(true);
					setSetting('custom-source-unlocked', true);
					props.refresh.current();
				}
			} else {
				currentIndex.current = 0;
			}
		}
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('keydown', onKeyDown);
		}
	}, [customSourceUnlocked]);

	const _source = (source === 'custom') ? (customSourceUnlocked ? 'custom' : 'gitee') : source;

	return (
		<div className="plugin-market-settings-container">
			<div className="plugin-market-settings">
				<div className="plugin-market-settings-header">
					<div className="plugin-market-settings-title">设置</div>
					<button className="plugin-market-settings-button" onClick={() => {
						props.closeSettings();
					}}><Icon name="close"/></button>
				</div>
				<div className="plugin-market-settings-content">
					<div className="plugin-market-settings-item">
						<div className="plugin-market-settings-item-title">插件源</div>
						<div className="plugin-market-settings-item-content">
							<div class="plugin-market-settings-radio">
								<label>
									<input type="radio" name="radio" checked={_source === 'gitee'} onChange={() => {
										setSource('gitee');
										setSetting('source', 'gitee');
										props.refresh.current([getBaseURL()]);
									}}/>
									<span>Gitee</span>
								</label>
								<label>
									<input type="radio" name="radio" checked={_source === 'github_usercontent'} onChange={() => {
										setSource('github_usercontent');
										setSetting('source', 'github_usercontent');
										props.refresh.current([getBaseURL()]);
									}}/>
									<span>Github (UserContent)</span>
								</label>
								<label>
									<input type="radio" name="radio" checked={_source === 'github_raw'} onChange={() => {
										setSource('github_raw');
										setSetting('source', 'github_raw');
										props.refresh.current([getBaseURL()]);
									}}/>
									<span>Github (Raw)</span>
								</label>
								<label>
									<input type="radio" name="radio" checked={_source === 'custom'} onChange={() => {
										setSource('custom');
										setSetting('source', 'custom');
										props.refresh.current([getBaseURL()]);
									}}/>
									<span>自定义</span>
								</label>
							</div>
							{
								_source === 'custom' && (
									<div className="plugin-market-settings-input plugin-market-settings-item-custom-source">
										<input
											className={`
												${customSource.match(/^(https?:\/\/)?[\w-]+(\.[\w-]+)+([\w-.,@?^=%&:/~+#]*[\w-@?^=%&/~+#])?$/) ? 'valid' : 'invalid'}
												${customSource === '' ? 'empty' : ''}
											`}
											type="text"
											placeholder="自定义地址"
											value={customSource}
											onBlur={(e) => {
												if (e.target.value.match(/^(https?:\/\/)?[\w-]+(\.[\w-]+)+([\w-.,@?^=%&:/~+#]*[\w-@?^=%&/~+#])?$/) && !e.target.value.endsWith('/')) {
													e.target.value += '/';
												}
												const oldCustomSource = getSetting('custom-source', '');
												setCustomSource(e.target.value);
												setSetting('custom-source', e.target.value);
												if (oldCustomSource !== e.target.value) {
													props.refresh.current();
												}
											}}
											onChange={(e) => {
												setCustomSource(e.target.value);
											}}
											onKeyDown={(e) => {
												if (e.key === 'Enter') {
													e.target.blur();
												}
											}}/>
									</div>
								)
							}
						</div>
					</div>

					{
						customSourceUnlocked && (
							<div className="plugin-market-settings-item">
								<div className="plugin-market-settings-item-title">附加源</div>
								<div className="plugin-market-settings-item-content">
									<div class="plugin-market-settings-additional-sources">
										{
											additionalSources.map((source, index) => (
												<div className="plugin-market-settings-additional-source-item">
													<div class="plugin-market-settings-input">
														<UrlInput
															className="plugin-market-settings-additional-source-input"
															placeholder="附加源地址"
															value={source}
															onBlur={(e, valueChanged) => {
																if (e.target.value.match(/^(https?:\/\/)?[\w-]+(\.[\w-]+)+([\w-.,@?^=%&:/~+#]*[\w-@?^=%&/~+#])?$/) && !e.target.value.endsWith('/')) {
																	e.target.value += '/';
																}
																const newAdditionalSources = [...additionalSources];
																newAdditionalSources[index] = e.target.value;
																additionalSourcesChanged(newAdditionalSources);
																if (valueChanged) {
																	props.refresh.current([e.target.value]);
																}
															}}
															onChange={(e) => {
																const newAdditionalSources = [...additionalSources];
																newAdditionalSources[index] = e.target.value;
																setAdditionalSources(newAdditionalSources);
															}}
														/>
													</div>
													<button
														className="plugin-market-settings-additional-source-move-up" 
														disabled={index === 0}
														onClick={() => {
															const newAdditionalSources = [...additionalSources];
															const temp = newAdditionalSources[index];
															newAdditionalSources[index] = newAdditionalSources[index - 1];
															newAdditionalSources[index - 1] = temp;
															additionalSourcesChanged(newAdditionalSources);
															props.refresh.current([]);
														}}>
															<Icon name="move_up"/>
													</button>
													<button 
														className="plugin-market-settings-additional-source-move-down"
														disabled={index === additionalSources.length - 1}
														onClick={() => {
															const newAdditionalSources = [...additionalSources];
															const temp = newAdditionalSources[index];
															newAdditionalSources[index] = newAdditionalSources[index + 1];
															newAdditionalSources[index + 1] = temp;
															additionalSourcesChanged(newAdditionalSources);
															props.refresh.current([]);
														}}>
															<Icon name="move_down"/>
													</button>
													<button className="plugin-market-settings-additional-source-remove" onClick={() => {
														const newAdditionalSources = [...additionalSources];
														newAdditionalSources.splice(index, 1);
														additionalSourcesChanged(newAdditionalSources);
														props.refresh.current([]);
													}
													}><Icon name="close"/></button>
												</div>
											))
										}
										<button className="plugin-market-settings-additional-source-add" onClick={() => {
											const newAdditionalSources = [...additionalSources];
											newAdditionalSources.push('');
											additionalSourcesChanged(newAdditionalSources);
										}}><Icon name="add"/> 添加</button>
									</div>
								</div>
							</div>
						)
					}
					
					{
						temporaryAdditionalSources?.length > 0 && customSourceUnlocked && (
							<div className="plugin-market-settings-item">
								<div className="plugin-market-settings-item-title">由插件添加的源</div>
								<div className="plugin-market-settings-item-content">
									<div class="plugin-market-settings-additional-sources">
										{
											temporaryAdditionalSources.map((source, index) => (
												<div className="plugin-market-settings-additional-source-item">
													<div class="plugin-market-settings-input">
														<UrlInput
															className="plugin-market-settings-additional-source-input"
															placeholder="附加源地址"
															value={source}
															disabled={true}
														/>
													</div>
													<button className="plugin-market-settings-additional-source-remove" onClick={() => {
														const newTemporaryAdditionalSources = [...temporaryAdditionalSources];
														newTemporaryAdditionalSources.splice(index, 1);
														setTemporaryAdditionalSources(newTemporaryAdditionalSources);
														window.pluginMarketTemporaryAdditionalSources = newTemporaryAdditionalSources;
														props.refresh.current([]);
													}
													}><Icon name="close"/></button>
												</div>
											))
										}
									</div>
								</div>
							</div>
						)
					}
				</div>
			</div>
		</div>
	)
}
function UrlInput(props) {
	const [url, setUrl] = React.useState(props.value);
	const lastValue = React.useRef(props.value);
	return (
		<input
			className={`
				${props.className || ''}
				${url.match(/^(https?:\/\/)?[\w-]+(\.[\w-]+)+([\w-.,@?^=%&:/~+#]*[\w-@?^=%&/~+#])?$/) ? 'valid' : 'invalid'}
				${url === '' ? 'empty' : ''}
			`}
			type="text"
			{...props.placeholder ? {placeholder: props.placeholder} : {}}
			{...props.disabled ? {disabled: props.disabled} : {}}
			value={props.value}
			onBlur={(e) => {
				if (!props.onBlur) return;
				const valueChanged = lastValue.current !== e.target.value;
				lastValue.current = e.target.value;
				props.onBlur(e, valueChanged);
			}}
			onChange={(e) => {
				setUrl(e.target.value);

				if (!props.onChange) return;
				props.onChange(e);
			}}
			onKeyDown={(e) => {
				if (e.key === 'Enter') {
					e.target.blur();
				}
			}}
		/>
	)
}


function Container (props) {
	const [showSettings, setShowSettings] = React.useState(false);
	const refresh = React.useRef(false);
	
	React.useEffect(() => {
		const onRefresh = (event) => {
			refresh.current([event.detail.url]);
		};
		document.addEventListener('plugin-market-refresh', onRefresh);
		return () => {
			document.removeEventListener('plugin-market-refresh', onRefresh);
		};
	}, []);

	return (
		<div className="plugin-market-root">
			{showSettings && <Settings closeSettings={() => setShowSettings(false)} refresh={refresh}/>}
			<PluginList openSettings={() => setShowSettings(true)} refresh={refresh} />
		</div>
	)
}
plugin.onConfig((tools) => {
	let dom = document.createElement('div');

	ReactDOM.render(<Container />, dom);
	return dom;
});