import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, parse as parsePath, relative, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { clearLine, cursorTo } from 'node:readline';
import { isCancel, multiselect, select } from '@clack/prompts';
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';
import * as TOML from '@iarna/toml';
import { cfgFromEnv } from './http.js';

export type InstallScope = 'project' | 'global';
export interface InstallOptions { agents: string[]; scope: InstallScope; list: boolean; dryRun: boolean; help: boolean; readonly: boolean }
export interface InstallContext {
  home: string; cwd: string; packageRoot: string; platform: NodeJS.Platform; env: NodeJS.ProcessEnv; nodePath: string;
  interactive: boolean; output: (message: string) => void; secret: () => Promise<string>;
  selectAgents: typeof multiselect<string>; selectScope: typeof select<InstallScope>;
  fetch: typeof fetch;
  /** 仅供隔离测试模拟写入失败，不接收凭证内容。 */
  beforeWrite?: (path: string) => void;
}
interface Agent { id: string; name: string; scopes: InstallScope[]; projectConfig?: string; globalConfig: string; projectSkill: string; globalSkill: string; format: 'jsonc' | 'toml' | 'opencode'; key: string }
export const AGENTS: readonly Agent[] = [
  { id: 'claude-code', name: 'Claude Code', scopes: ['project', 'global'], projectConfig: '.mcp.json', globalConfig: '.claude.json', projectSkill: '.claude/skills', globalSkill: '.claude/skills', format: 'jsonc', key: 'mcpServers' },
  { id: 'cursor', name: 'Cursor', scopes: ['project', 'global'], projectConfig: '.cursor/mcp.json', globalConfig: '.cursor/mcp.json', projectSkill: '.cursor/skills', globalSkill: '.cursor/skills', format: 'jsonc', key: 'mcpServers' },
  { id: 'codex', name: 'Codex', scopes: ['project', 'global'], projectConfig: '.codex/config.toml', globalConfig: '.codex/config.toml', projectSkill: '.agents/skills', globalSkill: '.agents/skills', format: 'toml', key: 'mcp_servers' },
  { id: 'gemini-cli', name: 'Gemini CLI', scopes: ['project', 'global'], projectConfig: '.gemini/settings.json', globalConfig: '.gemini/settings.json', projectSkill: '.gemini/skills', globalSkill: '.gemini/skills', format: 'jsonc', key: 'mcpServers' },
  { id: 'opencode', name: 'OpenCode', scopes: ['project', 'global'], projectConfig: 'opencode.json', globalConfig: '.config/opencode/opencode.json', projectSkill: '.agents/skills', globalSkill: '.config/opencode/skills', format: 'opencode', key: 'mcp' },
  { id: 'windsurf', name: 'Windsurf', scopes: ['global'], globalConfig: '.codeium/windsurf/mcp_config.json', projectSkill: '.windsurf/skills', globalSkill: '.codeium/windsurf/skills', format: 'jsonc', key: 'mcpServers' },
  { id: 'cline', name: 'Cline（VS Code 扩展）', scopes: ['global'], globalConfig: '@vscode/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json', projectSkill: '.cline/skills', globalSkill: '.cline/skills', format: 'jsonc', key: 'mcpServers' },
  { id: 'vscode', name: 'VS Code Copilot', scopes: ['project', 'global'], projectConfig: '.vscode/mcp.json', globalConfig: '@vscode/mcp.json', projectSkill: '.github/skills', globalSkill: '.copilot/skills', format: 'jsonc', key: 'servers' },
];

export const INSTALL_HELP = `用法：zhizhuip-agent-tools install [选项]
  --agents <列表>      逗号分隔客户端 ID；省略时用方向键移动、空格多选、回车确认
  --scope <范围>      project 或 global；省略时交互选择，非交互默认 global
  --readonly          安装只读 MCP；默认保留全部工具及写操作确认
  --list              列出已适配客户端、支持范围及检测结果
  --dry-run           仅检查并展示计划，不写文件、不读取或索要 Key
  --help, -h          显示帮助
实际安装必须提供 API Key：优先读取 ZHIZHUIP_TOKEN，未设置时在终端输入，显示首尾各 4 位，中间遮罩。
非交互执行必须设置 ZHIZHUIP_TOKEN 并指定 --agents；--help、--list、--dry-run 不需要 Key。
安装前请求用户信息接口验证 Key；交互输入失败可重新输入，Ctrl+C 取消；环境变量 Key 验证失败则退出。
验证通过前不修改已有配置，--help、--list、--dry-run 不发送验证请求。
固定运行目录位于 ~/.zhizhuip-agent-tools/versions/；Key、API 地址与超时写入所选客户端的环境配置。
project 配置只对当前目录生效；Cline 和 Windsurf 仅支持 global。
安装后需重新加载客户端；安装成功不代表真实代理已通过联网测试。
不接受 --yes，不设置客户端工具自动批准。`;

/** 解析安装参数，未知选项直接拒绝。
 *
 * @param argv install 后面的命令行参数。
 * @return {InstallOptions} 安装选项；未指定范围时使用 global。
 */
export function parseInstallArgs(argv: string[]): InstallOptions {
  const result: InstallOptions = { agents: [], scope: 'global', list: false, dryRun: false, help: false, readonly: false };
  for (let i = 0; i < argv.length; i++) {
    const [flag, ...rest] = argv[i].split('=');
    if (['--agents', '--scope'].includes(flag)) {
      const value = rest.length ? rest.join('=') : argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${flag} 缺少参数。`);
      if (flag === '--scope') {
        if (value !== 'project' && value !== 'global') throw new Error('--scope 只能为 project 或 global。');
        result.scope = value;
      } else result.agents.push(...value.split(',').map(s => s.trim()).filter(Boolean));
    } else if (rest.length) throw new Error('存在不支持的安装选项。');
    else if (flag === '--list') result.list = true;
    else if (flag === '--dry-run') result.dryRun = true;
    else if (flag === '--readonly') result.readonly = true;
    else if (flag === '--help' || flag === '-h') result.help = true;
    else throw new Error('存在不支持的安装选项；请使用 install --help。');
  }
  result.agents = [...new Set(result.agents)];
  for (const id of result.agents) if (!AGENTS.some(a => a.id === id)) throw new Error('存在未适配的客户端；请使用 install --list。');
  return result;
}

/** 获取当前系统的 VS Code 用户设置目录。
 *
 * @param c 安装环境；测试时可注入临时用户目录。
 * @return {string} VS Code 默认用户配置目录，不包含自定义配置档。
 */
function vscodeHome(c: InstallContext): string {
  if (c.platform === 'win32') return join(c.env.APPDATA || join(c.home, 'AppData', 'Roaming'), 'Code', 'User');
  if (c.platform === 'darwin') return join(c.home, 'Library', 'Application Support', 'Code', 'User');
  return join(c.env.XDG_CONFIG_HOME || join(c.home, '.config'), 'Code', 'User');
}

/** 校验目标始终位于指定目录，拒绝其中的符号链接与目录联接。
 *
 * @param base 本次允许写入的根目录。
 * @param target 待检查的文件或目录。
 * @return void，不返回业务结果。
 */
function safePath(base: string, target: string): void {
  const rel = relative(resolve(base), resolve(target));
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('目标路径超出安装范围。');
  const absolute = resolve(target);
  let current = parsePath(absolute).root;
  for (const part of ['', ...relative(current, absolute).split(sep).filter(Boolean)]) {
    if (part) current = join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) throw new Error('目标包含符号链接或目录联接，请手动处理该客户端路径。'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  }
}

export interface InstallTarget { agent: Agent; configPath: string; configRoot: string; skillPath: string; skillRoot: string; detected: boolean }
export interface InstallPlan { scope: InstallScope; readonly: boolean; targets: InstallTarget[]; managedRoot: string }

/** 按已适配客户端生成安装路径，不读取凭证或修改文件。
 *
 * @param options 解析后的安装选项。
 * @param c 安装环境与目录。
 * @return {InstallPlan} 安装目标及固定运行根目录。
 */
export function createInstallPlan(options: InstallOptions, c: InstallContext): InstallPlan {
  const project = options.scope === 'project';
  const targets = options.agents.map(id => {
    const agent = AGENTS.find(a => a.id === id)!;
    if (!agent.scopes.includes(options.scope)) throw new Error(`${agent.name} 暂不支持 ${options.scope} 一次安装，请选择 global。`);
    let configRoot = project ? c.cwd : c.home;
    let configPath = join(configRoot, project ? agent.projectConfig! : agent.globalConfig);
    let skillRoot = project ? c.cwd : c.home;
    let skillPath = join(skillRoot, project ? agent.projectSkill : agent.globalSkill, 'zhizhuip');
    if (!project && agent.globalConfig.startsWith('@vscode/')) {
      configRoot = vscodeHome(c); configPath = join(configRoot, agent.globalConfig.slice('@vscode/'.length));
    }
    if (!project && agent.id === 'codex' && c.env.CODEX_HOME) { configRoot = resolve(c.env.CODEX_HOME); configPath = join(configRoot, 'config.toml'); }
    if (!project && agent.id === 'opencode' && c.env.XDG_CONFIG_HOME) {
      configRoot = resolve(c.env.XDG_CONFIG_HOME); configPath = join(configRoot, 'opencode', 'opencode.json');
      skillRoot = configRoot; skillPath = join(configRoot, 'opencode', 'skills', 'zhizhuip');
    }
    if (agent.id === 'opencode') {
      const jsonc = configPath.replace(/\.json$/, '.jsonc');
      if (existsSync(jsonc)) configPath = jsonc;
    }
    const configDir = dirname(configPath);
    const detected = existsSync(configPath) || (configDir !== configRoot && existsSync(configDir)) || existsSync(dirname(skillPath)) || (agent.id === 'claude-code' && existsSync(join(project ? c.cwd : c.home, '.claude')));
    return { agent, configPath, configRoot, skillPath, skillRoot, detected };
  });
  const managedRoot = join(c.home, '.zhizhuip-agent-tools');
  return { scope: options.scope, readonly: options.readonly, targets, managedRoot };
}

/** 校验配置节点必须是对象，避免覆盖错误格式的数据。
 *
 * @param value 已解析的配置节点。
 * @return {Record<string, unknown>} 对象节点；数组、空值或标量会被拒绝。
 */
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('配置结构不是对象，未覆盖现有文件。');
  return value as Record<string, unknown>;
}

/** 生成单个客户端的新配置内容，保留未知设置。
 *
 * @param target 当前客户端配置位置与格式。
 * @param source 原配置文本；空字符串表示首次安装。
 * @param entryPath 固定运行目录中的 MCP 入口文件。
 * @param environment 本次安装的服务环境变量，覆盖同名旧值并保留其他变量；空对象仅供无 Key 预览。
 * @param readonly 是否仅加载只读工具。
 * @param nodePath 本次使用的 Node.js 可执行文件。
 * @return {string} 可写入的配置文本，不在日志中输出该文本。
 */
export function mergeClientConfig(target: InstallTarget, source: string, entryPath: string, environment: Record<string, string>, readonly: boolean, nodePath: string): string {
  const args = [entryPath, ...(readonly ? ['--readonly'] : [])];
  if (target.agent.format === 'toml') {
    let data: Record<string, unknown>;
    try { data = source.trim() ? object(TOML.parse(source)) : {}; } catch { throw new Error('TOML 配置解析失败，未覆盖现有文件。'); }
    const servers = data.mcp_servers === undefined ? {} : object(data.mcp_servers);
    const old = servers.zhizhuip === undefined ? {} : object(servers.zhizhuip);
    if (old.url !== undefined) throw new Error('同名 zhizhuip 是远程服务，请先解决配置冲突。');
    const env = { ...(old.env === undefined ? {} : object(old.env)), ...environment };
    servers.zhizhuip = { ...old, env, command: nodePath, args };
    data.mcp_servers = servers;
    return TOML.stringify(data as TOML.JsonMap);
  }
  const errors: ParseError[] = [];
  const data = source.trim() ? object(parse(source, errors, { allowTrailingComma: true })) : {};
  if (errors.length) throw new Error('JSON 配置解析失败，未覆盖现有文件。');
  let key = [target.agent.key];
  let entry: Record<string, unknown> = { command: nodePath, args };
  if (target.agent.id === 'vscode') entry.type = 'stdio';
  if (target.agent.id === 'opencode') {
    const mcp = data.mcp === undefined ? {} : object(data.mcp);
    const native = mcp.servers !== undefined;
    if (native) key = ['mcp', 'servers'];
    entry = { type: 'local', command: [nodePath, ...args], ...(native ? {} : { enabled: true }) };
  }
  let parent: Record<string, unknown> = data;
  for (const part of key) parent = parent[part] === undefined ? {} : object(parent[part]);
  const old = parent.zhizhuip === undefined ? {} : object(parent.zhizhuip);
  if (old.url !== undefined || old.type === 'remote') throw new Error('同名 zhizhuip 是远程服务，请先解决配置冲突。');
  const next = { ...old, ...entry };
  const envKey = target.agent.id === 'opencode' ? 'environment' : 'env';
  next[envKey] = { ...(next[envKey] === undefined ? {} : object(next[envKey])), ...environment };
  // 安装器管理自己的启动参数，不能继承旧配置中的跳过确认参数。
  return applyEdits(source.trim() ? source : '{}\n', modify(source.trim() ? source : '{}\n', [...key, 'zhizhuip'], next, { formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' } }));
}

interface FileAsset { source: string; relative: string }
/** 枚举普通文件；拒绝 Skill 和构建产物中的链接。
 *
 * @param dir 要复制的目录。
 * @param prefix 产物内的相对目录。
 * @return {FileAsset[]} 按名称排序的普通文件列表。
 */
function files(dir: string, prefix = ''): FileAsset[] {
  const result: FileAsset[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules' || name === '.git') continue;
    const source = join(dir, name); const info = lstatSync(source); const rel = join(prefix, name);
    if (info.isSymbolicLink()) throw new Error('安装源包含不支持的符号链接。');
    if (info.isDirectory()) result.push(...files(source, rel));
    else if (info.isFile()) result.push({ source, relative: rel });
  }
  return result;
}

/** 从包的真实位置解析生产依赖，兼容 npm 的提升目录。
 *
 * @param origin 当前包目录。
 * @param name 依赖包名。
 * @return {string | undefined} 依赖包真实目录；未安装时返回 undefined。
 */
function dependencyPath(origin: string, name: string): string | undefined {
  if (!/^(@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(name)) throw new Error('依赖名称无效。');
  const locations = createRequire(join(origin, 'package.json')).resolve.paths(name) ?? [];
  for (const location of locations) {
    const candidate = join(location, name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
  }
  return undefined;
}

/** 收集同包产物和实际已安装的生产依赖，不联网下载。
 *
 * @param root 当前运行包的根目录。
 * @return {{ assets: FileAsset[]; fingerprint: string }} 运行文件列表与内容指纹，供固定目录安装。
 */
export function runtimeAssets(root: string): { assets: FileAsset[]; fingerprint: string } {
  const assets = [
    { source: join(root, 'package.json'), relative: 'package.json' },
    { source: join(root, 'spec', 'tools.json'), relative: join('spec', 'tools.json') },
    { source: join(root, 'spec', 'dynamic-proxy-session.md'), relative: join('spec', 'dynamic-proxy-session.md') },
    ...files(join(root, 'dist', 'src'), join('dist', 'src')),
  ];
  const collect = (origin: string, target: string, ancestors: Map<string, string>): void => {
    const pkg = JSON.parse(readFileSync(join(origin, 'package.json'), 'utf8'));
    const names = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})]);
    for (const name of [...names].sort()) {
      const dep = dependencyPath(origin, name);
      const optional = name in (pkg.optionalDependencies ?? {}) || pkg.peerDependenciesMeta?.[name]?.optional;
      if (!dep) { if (optional) continue; throw new Error(`缺少生产依赖 ${name}，请先完成包安装。`); }
      if (ancestors.get(name) === dep) continue;
      const next = join(target, 'node_modules', name);
      assets.push(...files(dep, next));
      collect(dep, next, new Map([...ancestors, [name, dep]]));
    }
  };
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  collect(root, '', new Map([[pkg.name, realpathSync(root)]]));
  const hash = createHash('sha256');
  for (const asset of assets) hash.update(asset.relative).update('\0').update(readFileSync(asset.source));
  return { assets, fingerprint: hash.digest('hex').slice(0, 24) };
}

/** 将完整运行文件写入私有临时目录，全部就绪后再发布固定路径。
 *
 * @param root 根据内容指纹确定的运行目录。
 * @param assets 同包产物与实际生产依赖文件。
 * @param c 安装环境与允许写入的用户目录。
 * @return void；已有目录只有内容一致时才会复用。
 */
function prepareRuntime(root: string, assets: FileAsset[], c: InstallContext): void {
  safePath(c.home, root);
  if (existsSync(root)) {
    for (const asset of assets) {
      const path = join(root, asset.relative); safePath(c.home, path);
      if (!readFileSync(path).equals(readFileSync(asset.source))) throw new Error('固定运行目录内容不一致，请检查后重新安装。');
    }
    return;
  }
  const temporary = `${root}.staging-${randomUUID()}`;
  safePath(c.home, temporary); mkdirSync(temporary, { recursive: true, mode: 0o700 });
  try {
    for (const asset of assets) {
      const destination = join(temporary, asset.relative);
      const rel = relative(temporary, destination);
      if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) throw new Error('运行文件超出临时目录。');
      mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, readFileSync(asset.source), { flag: 'wx', mode: 0o644 });
    }
    safePath(c.home, root); safePath(c.home, temporary); renameSync(temporary, root);
  } finally {
    if (existsSync(temporary)) { safePath(c.home, temporary); rmSync(temporary, { recursive: true, force: true }); }
  }
}

interface Change { path: string; base: string; before?: Buffer; mode: number }
/** 原子更新文件并记录恢复信息；备份文件与源文件具有相同隐私权限。
 *
 * @param base 允许写入的根目录。
 * @param path 目标文件路径。
 * @param content 新内容。
 * @param mode 文件权限，包含 Key 的客户端配置使用 0600。
 * @param changes 本次客户端事务的恢复记录。
 * @param backups 需要报告的备份路径列表。
 * @param c 安装环境与测试故障注入点。
 * @return void，不返回业务结果。
 */
function writeManaged(base: string, path: string, content: Buffer | string, mode: number, changes: Change[], backups: string[], c: InstallContext): void {
  safePath(base, path);
  const before = existsSync(path) ? readFileSync(path) : undefined;
  const oldMode = before ? statSync(path).mode & 0o777 : mode;
  if (before?.equals(Buffer.from(content))) {
    if (oldMode !== mode) { changes.push({ path, base, before, mode: oldMode }); chmodSync(path, mode); }
    return;
  }
  c.beforeWrite?.(path);
  mkdirSync(dirname(path), { recursive: true });
  safePath(base, path);
  if (before) {
    const backup = `${path}.zhizhuip-backup-${randomUUID()}`;
    writeFileSync(backup, before, { flag: 'wx', mode: 0o600 }); backups.push(backup);
  }
  const temporary = `${path}.zhizhuip-tmp-${randomUUID()}`;
  try {
    writeFileSync(temporary, content, { flag: 'wx', mode });
    renameSync(temporary, path);
    changes.push({ path, base, before, mode: oldMode });
    chmodSync(path, mode);
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
}

/** 恢复当前客户端已写入的文件，不撤销其他客户端成功结果。
 *
 * @param changes 当前客户端的恢复记录。
 * @return {boolean} 是否完整恢复；失败时仍保留备份供用户处理。
 */
function rollback(changes: Change[]): boolean {
  let complete = true;
  for (const change of [...changes].reverse()) {
    try {
      safePath(change.base, change.path);
      if (change.before) { writeFileSync(change.path, change.before, { mode: change.mode }); chmodSync(change.path, change.mode); }
      else if (existsSync(change.path)) unlinkSync(change.path);
    } catch { complete = false; }
  }
  return complete;
}

export interface InstallResult { agent: string; success: boolean; configPath: string; skillPath: string; backups: string[]; error?: string }

/** 安装固定运行文件及所选客户端的 Skill，将 Key 写入对应客户端环境配置。
 *
 * @param plan 已确认范围的安装计划。
 * @param token 用户本机提供的 API Key，不写入日志。
 * @param c 安装环境与同包产物位置。
 * @return {InstallResult[]} 各客户端独立结果，失败客户端恢复自己的文件。
 */
export function installFromPlan(plan: InstallPlan, token: string, c: InstallContext): InstallResult[] {
  if (!token.trim()) throw new Error('缺少 API Key，未执行安装。');
  const cfg = cfgFromEnv({ ...c.env, ZHIZHUIP_TOKEN: token });
  const environment = { ZHIZHUIP_TOKEN: cfg.token, ZHIZHUIP_BASE_URL: cfg.baseUrl, ZHIZHUIP_TIMEOUT_MS: String(cfg.timeoutMs) };
  safePath(c.home, plan.managedRoot);
  const runtime = runtimeAssets(c.packageRoot);
  const runtimeRoot = join(plan.managedRoot, 'versions', runtime.fingerprint);
  const entryPath = join(runtimeRoot, 'dist', 'src', 'index.js');
  const skillFiles = files(join(c.packageRoot, 'skills', 'zhizhuip'));
  if (!skillFiles.some(f => f.relative === 'SKILL.md')) throw new Error('当前包没有包含蜘蛛 Skill，请更新安装包。');
  const planned = plan.targets.map(target => {
    try {
      safePath(target.configRoot, target.configPath); safePath(target.skillRoot, target.skillPath);
      for (const file of skillFiles) safePath(target.skillRoot, join(target.skillPath, file.relative));
      const source = existsSync(target.configPath) ? readFileSync(target.configPath, 'utf8') : '';
      return { target, content: mergeClientConfig(target, source, entryPath, environment, plan.readonly, c.nodePath) };
    } catch { return { target, error: '配置格式、路径或同名服务冲突，未修改此客户端；请检查后重试。' }; }
  });
  if (!planned.some(p => p.content !== undefined)) return planned.map(p => ({ agent: p.target.agent.id, success: false, configPath: p.target.configPath, skillPath: p.target.skillPath, backups: [], error: p.error }));
  try { prepareRuntime(runtimeRoot, runtime.assets, c); }
  catch { throw new Error('固定运行目录写入失败，未配置客户端，请检查后重试。'); }
  const installedSkills = new Set<string>();
  const results: InstallResult[] = planned.map(item => {
    const { target } = item; const changes: Change[] = []; const backups: string[] = [];
    const result = { agent: target.agent.id, configPath: target.configPath, skillPath: target.skillPath, backups };
    if (item.error || item.content === undefined) return { ...result, success: false, error: item.error };
    try {
      if (!installedSkills.has(target.skillPath)) for (const file of skillFiles) writeManaged(target.skillRoot, join(target.skillPath, file.relative), readFileSync(file.source), 0o644, changes, backups, c);
      writeManaged(target.configRoot, target.configPath, item.content, 0o600, changes, backups, c);
      installedSkills.add(target.skillPath);
      return { ...result, success: true };
    } catch {
      const restored = rollback(changes);
      return { ...result, success: false, error: restored ? '写入失败，已恢复此客户端的本次改动。' : '写入失败，部分文件未能恢复，请使用备份检查。' };
    }
  });
  return results;
}

/** 保留输入首尾各四位，遮住中间内容供终端核对。
 *
 * @param value 当前输入内容；不超过八位时全部显示。
 * @return string，首尾可见、中间最多八个星号的显示文本，避免长 Key 撑满终端。
 */
export function formatTokenInput(value: string): string {
  return value.length <= 8 ? value : value.slice(0, 4) + '*'.repeat(Math.min(value.length - 8, 8)) + value.slice(-4);
}

/** 从终端读取 API Key，输入时显示首尾，取消时恢复终端状态。
 *
 * @return {Promise<string>} 去除首尾空白的 Key；非交互终端会拒绝读取。
 */
async function readToken(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error('非交互模式请先设置 ZHIZHUIP_TOKEN。');
  const prompt = 'API Key（首尾可见）：';
  process.stdout.write(prompt);
  const input = process.stdin; const previous = input.isRaw; input.setRawMode(true); input.resume(); input.setEncoding('utf8');
  return new Promise((done, reject) => {
    let value = '';
    const redraw = (): void => { cursorTo(process.stdout, 0); clearLine(process.stdout, 0); process.stdout.write(prompt + formatTokenInput(value)); };
    const finish = (cancelled: boolean): void => { input.off('data', handler); input.setRawMode(previous); input.pause(); redraw(); process.stdout.write('\n'); cancelled ? reject(new Error('已取消安装。')) : done(value.trim()); };
    const handler = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === '\u0003' || ch === '\u0004') { finish(true); return; }
        if (ch === '\r' || ch === '\n') { finish(false); return; }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ' && ch !== '\u001b') value += ch;
      }
      redraw();
    };
    input.on('data', handler);
  });
}

/** 通过用户信息接口验证 Key，仅确认身份，不输出响应中的账户数据。
 *
 * @param token 本次安装准备使用的完整 API Key。
 * @param c 安装环境，提供接口配置与请求实现。
 * @return {Promise<void>} 验证成功后返回，不写入安装文件。
 * @throws Error，认证、网络、服务状态或响应结构异常时阻止安装。
 */
async function validateToken(token: string, c: InstallContext): Promise<void> {
  const cfg = cfgFromEnv({ ...c.env, ZHIZHUIP_TOKEN: token });
  const url = new URL(cfg.baseUrl + '/externalapi/user/getGetUserInfo');
  url.searchParams.set('is_mcp_send', '1');
  let response: Response;
  let body: Record<string, unknown> | undefined;
  try {
    response = await c.fetch(url, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(cfg.timeoutMs),
      headers: { token, accept: 'application/json', 'accept-language': 'zh-CN', 'user-agent': 'zhizhuip mcp' },
    });
    const raw = await response.text();
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    } catch { /* 非 JSON 响应在下面统一拒绝，不输出原文。 */ }
  } catch (error) {
    throw new Error(error instanceof Error && error.name === 'TimeoutError'
      ? 'API Key 验证失败：请求超时，未执行安装。请检查网络。'
      : 'API Key 验证失败：无法连接验证接口，未执行安装。请检查网络和接口地址。');
  }
  if ([401, 403].includes(response.status) || [401, 403, '401', '403'].includes(body?.code as number | string)) {
    throw new Error('API Key 验证失败：Key 无效或无权限，未执行安装。请核对 Key。');
  }
  if (!response.ok) throw new Error(`API Key 验证失败：服务返回 HTTP ${response.status}，未执行安装。请稍后重试。`);
  if (!body || (body.code !== 1 && body.code !== '1')) {
    throw new Error('API Key 验证失败：用户信息接口未返回成功结果，未执行安装。请核对 Key 或稍后重试。');
  }
  const data = body.data;
  const id = data !== null && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>).id : undefined;
  if ((typeof id !== 'number' && typeof id !== 'string') || !/^[1-9]\d*$/.test(String(id))) {
    throw new Error('API Key 验证失败：用户信息响应不完整，未执行安装。请稍后重试。');
  }
}

/** 运行安装子命令，手动输入验证失败可重输，验证通过后才写入目标目录。
 *
 * @param argv install 后面的参数。
 * @param context 可选环境覆盖；省略时使用当前机器和同包产物。
 * @return {Promise<number>} CLI 退出码，0 表示完成或预览成功，1 表示安装失败或部分失败。
 */
export async function runInstall(argv: string[], context: Partial<InstallContext> = {}): Promise<number> {
  const c: InstallContext = {
    home: homedir(), cwd: process.cwd(), packageRoot: fileURLToPath(new URL('../../', import.meta.url)), platform: process.platform,
    env: process.env, nodePath: process.execPath, interactive: !!process.stdin.isTTY && !!process.stdout.isTTY,
    output: message => {
      const color = message.startsWith('API Key 验证失败') ? 31
        : message === 'API Key 验证通过，开始安装。' || message.endsWith('：Skill 和 MCP 配置已安装') || message === '请重启对应客户端，即可使用蜘蛛 IP。' ? 32 : undefined;
      console.log(color && process.stdout.isTTY && process.stdout.hasColors?.() ? `\x1b[1;${color}m${message}\x1b[0m` : message);
    },
    secret: readToken, fetch, selectAgents: multiselect, selectScope: select,
    ...context,
  };
  try {
    const options = parseInstallArgs(argv);
    if (options.help) { c.output(INSTALL_HELP); return 0; }
    if (options.list || !options.agents.length) {
      const probes = AGENTS.map(agent => createInstallPlan({ ...options, agents: [agent.id], scope: agent.scopes.includes(options.scope) ? options.scope : 'global' }, c).targets[0]);
      if (options.list) {
        for (const { agent, detected } of probes) c.output(`${agent.id}：${agent.name}；范围 ${agent.scopes.join('/')}；${detected ? '检测到相关目录' : '未检测到相关目录'}`);
        return 0;
      }
      if (!c.interactive) throw new Error('请通过 --agents 明确选择客户端；不会自动安装到全部客户端。');
      const choice = await c.selectAgents({
        message: '选择安装蜘蛛 IP 的客户端（方向键移动，空格选择，回车继续）：',
        options: probes.map(({ agent, detected }) => ({
          value: agent.id, label: agent.name,
          hint: [detected ? '检测到相关目录' : '', agent.scopes.length === 1 ? '仅支持全局安装' : ''].filter(Boolean).join('；') || undefined,
        })),
        required: true,
      });
      if (isCancel(choice)) throw new Error('已取消安装。');
      options.agents = choice;
      if (!options.agents.length) throw new Error('未选择客户端，未执行安装。');
    }
    if (c.interactive && !argv.some(arg => arg === '--scope' || arg.startsWith('--scope='))) {
      const choice = await c.selectScope({
        message: '安装范围（方向键选择，回车继续）：',
        options: [
          { value: 'global' as const, label: '当前用户的所有项目' },
          { value: 'project' as const, label: '当前项目' },
        ].filter(option => options.agents.every(id => AGENTS.find(agent => agent.id === id)!.scopes.includes(option.value))),
        initialValue: 'global',
      });
      if (isCancel(choice)) throw new Error('已取消安装。');
      options.scope = choice;
    }
    const plan = createInstallPlan(options, c);
    c.output(`安装范围：${plan.scope}；MCP：${plan.readonly ? '只读' : '全部工具，保留写操作确认'}。`);
    for (const target of plan.targets) c.output(`${target.agent.name}\n  Skill：${target.skillPath}\n  MCP：${target.configPath}`);
    c.output(`固定运行目录：${join(plan.managedRoot, 'versions')}`);
    if (options.dryRun) {
      let valid = true;
      for (const target of plan.targets) {
        try {
          safePath(target.configRoot, target.configPath); safePath(target.skillRoot, target.skillPath);
          mergeClientConfig(target, existsSync(target.configPath) ? readFileSync(target.configPath, 'utf8') : '', join(plan.managedRoot, 'versions', '<内容指纹>', 'dist', 'src', 'index.js'), {}, plan.readonly, c.nodePath);
        } catch { valid = false; c.output(`${target.agent.name}：预检查失败，请检查配置格式、路径或同名服务。`); }
      }
      c.output('仅预览，未写文件或读取 Key。'); return valid ? 0 : 1;
    }
    let token = c.env.ZHIZHUIP_TOKEN?.trim() || '';
    const promptForToken = c.interactive && !token;
    // 仅手动输入允许重试，环境变量失败时由调用方修正后重跑。
    while (true) {
      if (promptForToken) token = (await c.secret()).trim();
      if (!token) {
        if (!promptForToken) throw new Error('缺少 API Key；请在终端输入，非交互模式请设置 ZHIZHUIP_TOKEN。');
        c.output('API Key 不能为空，请重新输入；Ctrl+C 取消。');
        continue;
      }
      c.output('正在验证 API Key…');
      try {
        await validateToken(token, c);
        break;
      } catch (error) {
        if (!promptForToken || !(error instanceof Error) || !error.message.startsWith('API Key 验证失败')) throw error;
        c.output(error.message);
        c.output('请核对 Key 或网络后重新输入；Ctrl+C 取消。');
      }
    }
    c.output('API Key 验证通过，开始安装。');
    const results = installFromPlan(plan, token, c);
    for (const result of results) {
      c.output(`${result.agent}：${result.success ? 'Skill 和 MCP 配置已安装' : result.error}`);
      if (!result.success) for (const backup of result.backups) c.output(`  备份：${backup}`);
    }
    if (results.some(r => r.success)) c.output('请重启对应客户端，即可使用蜘蛛 IP。');
    return results.every(r => r.success) ? 0 : 1;
  } catch (e) {
    // 不转述来自文件内容或底层解析器的异常，避免错误文本携带凭证。
    const message = e instanceof Error ? e.message : '';
    const safe = /^(存在不支持|存在未适配|--scope|--agents|--scope|缺少 API Key|API Key 验证失败|非交互模式|已取消安装|请通过 --agents|未选择客户端|固定运行目录|当前包没有|缺少生产依赖)/.test(message) || message.includes('暂不支持');
    c.output(safe ? message : '安装失败，请检查目录权限、包内容与现有配置；未输出敏感内容。'); return 1;
  }
}
