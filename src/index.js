import { compareVersions, satisfies } from 'compare-versions';
import { getPluginDownloads } from './analyze';
import { Icon } from './icons';
import { installPlugin, getDependencies, deletePlugin, loadOnlinePlugins, baseURL } from './pluginManage';
import { formatNumber, formatShortTime } from './utils';
import './styles.scss'




let currentBetterNCMVersion = await betterncm.app.getBetterNCMVersion();

class PluginList extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			onlinePlugins: null,
			pluginsAnalyzeData: null,
			requireReload: false,
			category: 'all',
			search: '',
			sort_by: 'downloads',
			sort_order: 'desc'
		};
		this.requireReload = this.requireReload.bind(this);
		this.setInstalled = this.setInstalled.bind(this);
		this.setHasUpdate = this.setHasUpdate.bind(this);
	}

	async componentDidMount() {
		loadOnlinePlugins().then(
			onlinePlugins => {
				onlinePlugins = onlinePlugins.map(plugin => {
					plugin.installed = !!loadedPlugins[plugin.slug];
					plugin.hasUpdate = plugin.installed && compareVersions(plugin.version, loadedPlugins[plugin.slug].manifest.version) > 0;
					plugin.type = plugin.type ?? 'extension';
					return plugin;
				}).filter(plugin => !(plugin.deprecated || plugin.hide));
				this.setState({ onlinePlugins });
			});
		getPluginDownloads().then(pluginsAnalyzeData => this.setState({ pluginsAnalyzeData }));
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

	requireReload() {
		this.setState({
			requireReload: true
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
			return <div className="plugin-market-container loading">
				<Icon name="loading" className="spinning" />
				<div>加载插件中...</div>
			</div>;
		}
		return (
			<div>
				<div className="plugin-market-filters">
					<div className="plugin-market-filter-category">
						<button className={this.state.category === 'all' ? 'active' : ''} onClick={() => this.setState({ category: 'all' })}>全部</button>
						<button className={this.state.category === 'extension' ? 'active' : ''} onClick={() => this.setState({ category: 'extension' })}>扩展</button>
						<button className={this.state.category === 'theme' ? 'active' : ''} onClick={() => this.setState({ category: 'theme' })}>主题</button>
						{this.state.onlinePlugins.filter(plugin => plugin.installed).length > 0 && <button className={this.state.category === 'installed' ? 'active' : ''} onClick={() => this.setState({ category: 'installed' })}>已安装</button>}
						{this.state.onlinePlugins.filter(plugin => plugin.hasUpdate).length > 0 && <button className={`has-update ${this.state.category === 'update' ? 'active' : ''}`} onClick={() => this.setState({ category: 'update' })}>有更新</button>}
					</div>
					<div className={`plugin-market-filter-search ${this.state.search ? 'filled' : ''}`}>
						<Icon name="search" />
						<input placeholder="搜索..." onChange={e => this.setState({ search: e.target.value })} />
					</div>
					<div className="plugin-market-filter-sort">
						{this.state.pluginsAnalyzeData && <button title="下载量" className={`${this.state.sort_by === 'downloads' ? 'active' : ''} ${this.state.sort_order}`} onClick={() => this.setSortBy('downloads')}><Icon name="download" /></button>}
						<button title="更新时间" className={`${this.state.sort_by === 'update' ? 'active' : ''} ${this.state.sort_order}`} onClick={() => this.setSortBy('update')}><Icon name="clock" /></button>
						<button title="名称" className={`${this.state.sort_by === 'name' ? 'active' : ''} ${this.state.sort_order}`} onClick={() => this.setSortBy('name')}><Icon name="atoz" /></button>
					</div>
				</div>
				<div className="plugin-market-container">
					{
						this.state.onlinePlugins
							.filter(
								plugin => {
									if (plugin.deprecated || plugin.hide) return false;
									if (!plugin.betterncm_version) return true;
									return satisfies(currentBetterNCMVersion, plugin.betterncm_version);
								}
							)
							.filter(
								plugin => {
									if (this.state.category === 'all') return plugin.type !== 'lib';
									if (this.state.category === 'installed') return plugin.installed;
									if (this.state.category === 'update') return plugin.hasUpdate;
									return this.state.category == (plugin.type ?? 'extension');
								}
							)
							.filter(
								plugin => {
									if (!this.state.search) return true;
									const search = this.state.search.toLowerCase();
									return plugin.name.toLowerCase().includes(search) ||
										plugin.slug.toLowerCase().includes(search) ||
										plugin.author.toLowerCase().includes(search);
								}
							)
							.sort((a, b) => {
								return (() => {
									switch (this.state.sort_by) {
										case 'downloads':
											return (this.state.pluginsAnalyzeData?.find(v => v.name === a.slug)?.count ?? 0) -
												(this.state.pluginsAnalyzeData?.find(v => v.name === b.slug)?.count ?? 0);
										case 'name':
											return a.name > b.name ? 1 : -1;
										case 'update':
											return a.update_time - b.update_time;
									}
								})() * (this.state.sort_order === 'asc' ? 1 : -1)
							})
							.sort((a, b) => {
								if (a.type === 'lib' && b.type !== 'lib') return 1;
								if (a.type !== 'lib' && b.type === 'lib') return -1;
								return 0;
							})
							.map((plugin) => {
								return <div key={plugin.slug} className="plugin-item-wrapper">
									<PluginItem
										key={plugin.slug}
										downloads={this.state.pluginsAnalyzeData?.find(v => v.name === plugin.slug)?.count}
										plugin={plugin}
										onlinePlugins={this.state.onlinePlugins}
										requireReload={this.requireReload}
										setInstalled={this.setInstalled}
										setHasUpdate={this.setHasUpdate}
									/>
								</div>;
							})
					}
				</div>
				{
					this.state.requireReload ?
						<div className="reload-notice">
							<div>插件的更改需要重载以生效</div>
							<button onClick={async () => {
								await betterncm.app.reloadPlugins();
								betterncm.reload()
							}}><Icon name="reload" /> 重载</button>
						</div>
						: null
				}
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
			this.props.requireReload();
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
			this.props.requireReload();
		} else {
			this.setState({
				deleting: false
			});
			console.log(result);
		}
	}

	canDelete() {
		if (this.props.plugin.type === 'lib') {
			const installedPlugins = this.props.onlinePlugins.filter(v => v.installed);
			for (const plugin of installedPlugins) {
				if (plugin.requirements?.includes(this.props.plugin.slug)) {
					return false;
				}
			}
		}
		return true;
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
			if (this.hasSettings()) {
				buttons.push(
					<button className="plugin-action-button" onClick={() => { document.querySelector(`.better-ncm-manager .loaded-plugins-list .plugin-btn[plugin-slug='${this.props.plugin.slug}']`).click() }}>
						<Icon name="settings" />
					</button>
				)
			}
			if (this.props.plugin.hasUpdate) {
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
					<button className="plugin-action-button" onClick={() => { this.install() }}>
						<Icon name="download" />
					</button>
				)
			)
		}
		return buttons;
	}


	render() {
		let preview = this.props.plugin.preview ? baseURL + this.props.plugin.preview : "unset";
		let authorLink = this.props.plugin['author_link'] ?? (this.props.plugin['author_links'] ?? [])[0] ?? null;
		if (authorLink) {
			if (!authorLink.startsWith('http')) {
				authorLink = 'https://' + authorLink;
			}
			if (!authorLink.match(/^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/)) {
				authorLink = null;
			}
		}
		return (
			<div className={`plugin-item ${this.state.installing ? 'installing' : ''} ${this.state.deleting ? 'deleting' : ''}`}>
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
						<div className="plugin-item-description">{this.props.plugin.description}</div>
						<div>
							{
								this.props.downloads > 0 &&
								<span className="plugin-item-meta plugin-downloads" title="下载量"><Icon name="download" /><span>{formatNumber(this.props.downloads)}</span></span>
							}

							<span className="plugin-item-meta plugin-item-version" title="版本号">
								{
									this.props.plugin.hasUpdate ?
										(<span><Icon name="has_update" /> {loadedPlugins[this.props.plugin.slug].manifest.version} → <span className='new-version'>{this.props.plugin.version}</span></span>) :
										(<span><Icon name="tag" />{this.props.plugin.version}</span>)
								}
							</span>

							<span className="plugin-item-meta plugin-item-update-time" title="最后更新时间">
								<Icon name="clock"/> {formatShortTime(this.props.plugin.update_time)}
							</span>

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
						this.props.plugin.type === 'lib' ? (
							<div className="plugin-item-state-indicator lib">
								<Icon name="boxes" />
							</div>
						) : null
					}
				</div>

			</div>
		)
	}
}



plugin.onConfig((tools) => {
	let dom = document.createElement('div');
	ReactDOM.render(<PluginList />, dom);
	return dom;
});