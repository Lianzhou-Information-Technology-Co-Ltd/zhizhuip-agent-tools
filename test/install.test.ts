import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { parse as parseJsonc } from 'jsonc-parser';
import * as TOML from '@iarna/toml';
import { AGENTS, createInstallPlan, formatTokenInput, installFromPlan, mergeClientConfig, parseInstallArgs, runInstall, runtimeAssets, type InstallContext, type InstallTarget } from '../src/install.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

/** 写入隔离测试文件，并创建所需父目录。
 *
 * @param path 临时目录中的目标文件。
 * @param content 文件文本内容。
 * @return void，不返回业务结果。
 */
function put(path: string, content: string): void { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
/** 创建独立用户目录、项目目录和最小运行包。
 *
 * @return {InstallContext & { root: string; messages: string[] }} 隔离环境与输出记录。
 */
function fixture(): InstallContext & { root: string; messages: string[] } {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'zhizhuip-install-')); roots.push(root);
  const home = join(root, 'home'); const cwd = join(root, 'project'); const packageRoot = join(root, 'source');
  mkdirSync(home); mkdirSync(cwd); const messages: string[] = [];
  put(join(packageRoot, 'package.json'), JSON.stringify({ name: 'fixture-mcp', version: '0.1.0', type: 'module', dependencies: { 'dep-a': '1.0.0' } }));
  put(join(packageRoot, 'dist/src/index.js'), `import value from 'dep-a'; console.log(JSON.stringify({value, token: process.env.ZHIZHUIP_TOKEN, args: process.argv.slice(2)}));`);
  put(join(packageRoot, 'spec/tools.json'), '[]'); put(join(packageRoot, 'spec/dynamic-proxy-session.md'), '# Fixture');
  put(join(packageRoot, 'skills/zhizhuip/SKILL.md'), '---\nname: zhizhuip\ndescription: fixture\n---\n# Fixture');
  put(join(packageRoot, 'skills/zhizhuip/references/example.md'), '# Example');
  put(join(packageRoot, 'node_modules/dep-a/package.json'), JSON.stringify({ name: 'dep-a', version: '1.0.0', type: 'module', main: 'index.js', dependencies: { 'dep-b': '2.0.0' }, optionalDependencies: { 'missing-optional': '1.0.0' } }));
  put(join(packageRoot, 'node_modules/dep-a/index.js'), `import value from 'dep-b'; export default 'a:' + value;`);
  put(join(packageRoot, 'node_modules/dep-b/package.json'), JSON.stringify({ name: 'dep-b', version: '2.0.0', type: 'module', main: 'index.js' }));
  put(join(packageRoot, 'node_modules/dep-b/index.js'), `export default 'b';`);
  return { root, home, cwd, packageRoot, messages, platform: process.platform, env: {}, nodePath: process.execPath, interactive: false,
    fetch: vi.fn(async () => new Response(JSON.stringify({ code: 1, data: { id: 1 } }))),
    output: message => messages.push(message), ask: vi.fn(async () => ''), secret: vi.fn(async () => 'fixture-secret') };
}
/** 按指定客户端生成测试安装计划。
 *
 * @param c 隔离安装环境。
 * @param ids 本次客户端 ID 列表。
 * @param scope 安装范围，省略时使用 global。
 * @return {InstallPlan} 对应客户端的安装计划。
 */
function plan(c: InstallContext, ids: string[], scope: 'global' | 'project' = 'global') {
  return createInstallPlan(parseInstallArgs(['--agents', ids.join(','), '--scope', scope]), c);
}
/** 按客户端格式读取测试配置。
 *
 * @param target 当前客户端安装目标。
 * @return {Record<string, any>} 已解析的配置对象。
 */
function readConfig(target: InstallTarget): Record<string, any> {
  const text = readFileSync(target.configPath, 'utf8');
  return target.agent.format === 'toml' ? TOML.parse(text) : parseJsonc(text);
}
/** 取得测试配置中的蜘蛛 MCP 服务。
 *
 * @param target 当前客户端安装目标。
 * @return {Record<string, any>} 蜘蛛服务的启动配置。
 */
function server(target: InstallTarget): Record<string, any> {
  const cfg = readConfig(target);
  return target.agent.id === 'opencode' ? cfg.mcp.servers?.zhizhuip ?? cfg.mcp.zhizhuip : cfg[target.agent.key].zhizhuip;
}

describe('安装参数和范围', () => {
  it('解析多个客户端、范围、只读与预览，重复客户端去重', () => {
    expect(parseInstallArgs(['--agents=codex,cursor', '--agents', 'codex', '--scope', 'project', '--readonly', '--dry-run'])).toEqual({ agents: ['codex', 'cursor'], scope: 'project', readonly: true, dryRun: true, help: false, list: false });
  });
  it.each([['--yes'], ['--token', 'secret'], ['--agents', 'unknown'], ['--scope', 'user'], ['--agents']].map(args => ({ args })))('拒绝不支持的参数 $args', ({ args }) => {
    expect(() => parseInstallArgs(args)).toThrow();
  });
  it('全部八个客户端明确列出作用域', () => {
    expect(AGENTS.map(a => a.id)).toEqual(['claude-code', 'cursor', 'codex', 'gemini-cli', 'opencode', 'windsurf', 'cline', 'vscode']);
    const c = fixture();
    for (const id of ['windsurf', 'cline']) expect(() => plan(c, [id], 'project')).toThrow('暂不支持');
    expect(plan(c, AGENTS.map(a => a.id)).targets.every(t => !t.detected)).toBe(true);
  });
  it('VS Code 和 Cline 用户路径随操作系统变化', () => {
    const c = fixture();
    const win = plan({ ...c, platform: 'win32', env: { APPDATA: join(c.root, 'roaming') } }, ['vscode', 'cline']);
    expect(win.targets[0].configPath).toBe(join(c.root, 'roaming/Code/User/mcp.json'));
    expect(win.targets[1].configPath).toContain('saoudrizwan.claude-dev');
    const mac = plan({ ...c, platform: 'darwin' }, ['vscode']);
    expect(mac.targets[0].configPath).toBe(join(c.home, 'Library/Application Support/Code/User/mcp.json'));
    const linux = plan({ ...c, platform: 'linux', env: { XDG_CONFIG_HOME: join(c.root, 'xdg') } }, ['vscode']);
    expect(linux.targets[0].configPath).toBe(join(c.root, 'xdg/Code/User/mcp.json'));
  });
  it('采用 CODEX_HOME、XDG_CONFIG_HOME 及 OpenCode 现有 JSONC', () => {
    const c = fixture(); c.env = { CODEX_HOME: join(c.root, 'codex-custom'), XDG_CONFIG_HOME: join(c.root, 'config-custom') };
    put(join(c.env.XDG_CONFIG_HOME!, 'opencode/opencode.jsonc'), '{/* keep */}');
    const p = plan(c, ['codex', 'opencode']);
    expect(p.targets[0].configPath).toBe(join(c.env.CODEX_HOME!, 'config.toml'));
    expect(p.targets[1].configPath).toBe(join(c.env.XDG_CONFIG_HOME!, 'opencode/opencode.jsonc'));
    expect(p.targets[1].skillPath).toBe(join(c.env.XDG_CONFIG_HOME!, 'opencode/skills/zhizhuip'));
  });
});

describe('配置合并和幂等安装', () => {
  it.each(AGENTS.map(agent => [agent.id]))('%s 全局安装保留其他设置和服务，不写入 Key 或 --yes', id => {
    const c = fixture(); const p = plan(c, [id]); const t = p.targets[0];
    const initial = t.agent.format === 'toml'
      ? 'model = "keep"\n[mcp_servers.other]\ncommand = "other"\n'
      : JSON.stringify({ unrelated: { keep: true }, [t.agent.key]: { other: { command: 'other' } } });
    put(t.configPath, initial);
    const results = installFromPlan(p, 'fixture-new-key', c);
    expect(results[0].success).toBe(true);
    const cfg = readConfig(t); const added = server(t);
    expect(cfg[t.agent.key].other.command).toBe('other');
    expect(t.agent.format === 'toml' ? cfg.model : cfg.unrelated.keep).toBe(t.agent.format === 'toml' ? 'keep' : true);
    expect(readFileSync(t.configPath, 'utf8')).not.toContain('fixture-new-key');
    expect(JSON.stringify(added)).not.toContain('--yes');
    expect(readFileSync(join(t.skillPath, 'SKILL.md'), 'utf8')).toContain('# Fixture');
    expect(JSON.parse(readFileSync(p.credentialPath, 'utf8')).token).toBe('fixture-new-key');
    expect(results[0].backups.some(path => readFileSync(path, 'utf8') === initial)).toBe(true);
    const first = readFileSync(t.configPath, 'utf8');
    const again = installFromPlan(p, 'fixture-new-key', c);
    expect(again[0].success).toBe(true); expect(again[0].backups).toEqual([]);
    expect(readFileSync(t.configPath, 'utf8')).toBe(first);
  });
  it.each(AGENTS.filter(a => a.scopes.includes('project')).map(a => [a.id]))('%s 项目安装不写全局客户端配置', id => {
    const c = fixture(); const p = plan(c, [id], 'project');
    expect(installFromPlan(p, 'fixture-key', c)[0].success).toBe(true);
    expect(p.targets[0].configPath.startsWith(c.cwd)).toBe(true);
    expect(p.targets[0].skillPath.startsWith(c.cwd)).toBe(true);
    const global = plan(c, [id]);
    expect(existsSync(global.targets[0].configPath)).toBe(false);
  });
  it('保留 JSONC 注释和未知服务器字段，清除旧 Key，替换跳过确认参数', () => {
    const c = fixture(); const p = plan(c, ['cursor']); const t = p.targets[0];
    put(t.configPath, '{\n // comment survives\n "mcpServers": {"zhizhuip":{"command":"old","args":["--yes"],"timeout":123,"env":{"ZHIZHUIP_TOKEN":"old-key","OTHER":"keep"}}}\n}');
    expect(installFromPlan(p, 'new-key', c)[0].success).toBe(true);
    expect(readFileSync(t.configPath, 'utf8')).toContain('// comment survives');
    expect(server(t).timeout).toBe(123); expect(server(t).env).toEqual({ OTHER: 'keep' });
    expect(server(t).args).not.toContain('--yes');
  });
  it('Codex TOML 保留嵌套设置且旧 Key 不覆盖新凭证', () => {
    const c = fixture(); const p = plan(c, ['codex']); const t = p.targets[0];
    put(t.configPath, '[mcp_servers.zhizhuip]\ncommand = "old"\nstartup_timeout_sec = 30\n[mcp_servers.zhizhuip.env]\nZHIZHUIP_TOKEN = "old"\nOTHER = "keep"\n[profiles.default]\nmodel = "keep"\n');
    expect(installFromPlan(p, 'new-key', c)[0].success).toBe(true);
    expect(server(t).env).toEqual({ OTHER: 'keep' }); expect(server(t).startup_timeout_sec).toBe(30);
    expect(readConfig(t).profiles.default.model).toBe('keep');
  });
  it('OpenCode 原生 mcp.servers 格式不混入旧 enabled 字段', () => {
    const c = fixture(); const p = plan(c, ['opencode']); const t = p.targets[0];
    put(t.configPath, '{"mcp":{"servers":{"other":{"type":"local","command":["other"]}}}}');
    expect(installFromPlan(p, 'fixture-key', c)[0].success).toBe(true);
    const cfg = readConfig(t); expect(cfg.mcp.zhizhuip).toBeUndefined();
    expect(cfg.mcp.servers.zhizhuip.enabled).toBeUndefined(); expect(cfg.mcp.servers.other.command).toEqual(['other']);
  });
  it('不覆盖同名远程服务或错误配置，也不生成运行目录', () => {
    const c = fixture(); const p = plan(c, ['cursor', 'codex']);
    put(p.targets[0].configPath, '{"mcpServers":{"zhizhuip":{"url":"https://example.invalid"}}}');
    put(p.targets[1].configPath, 'invalid = [');
    const before = p.targets.map(t => readFileSync(t.configPath, 'utf8'));
    expect(installFromPlan(p, 'fixture-key', c).every(r => !r.success)).toBe(true);
    expect(p.targets.map(t => readFileSync(t.configPath, 'utf8'))).toEqual(before);
    expect(existsSync(p.managedRoot)).toBe(false);
  });
  it('保留自定义 Skill 文件，更新包内文件', () => {
    const c = fixture(); const p = plan(c, ['cursor']); const t = p.targets[0];
    put(join(t.skillPath, 'SKILL.md'), '# old'); put(join(t.skillPath, 'user-note.md'), '# keep');
    expect(installFromPlan(p, 'fixture-key', c)[0].success).toBe(true);
    expect(readFileSync(join(t.skillPath, 'user-note.md'), 'utf8')).toBe('# keep');
    expect(readFileSync(join(t.skillPath, 'SKILL.md'), 'utf8')).toContain('# Fixture');
  });
});

describe('固定运行目录和失败隔离', () => {
  it('实际 MCP 生产依赖闭包在移除模拟源包后仍完成初始化、工具和资源读取', async () => {
    const c = fixture();
    const sourceRoot = process.env.ZHIZHUIP_INSTALL_TEST_PACKAGE_ROOT || fileURLToPath(new URL('../', import.meta.url));
    const sourceAssets = runtimeAssets(sourceRoot);
    rmSync(c.packageRoot, { recursive: true, force: true });
    for (const asset of sourceAssets.assets) {
      const destination = join(c.packageRoot, asset.relative); mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, readFileSync(asset.source));
    }
    put(join(c.packageRoot, 'skills/zhizhuip/SKILL.md'), '---\nname: zhizhuip\ndescription: fixture\n---\n# Fixture');
    const p = plan(c, ['codex']); p.readonly = true;
    expect(installFromPlan(p, 'sk-fixture-not-real', c)[0].success).toBe(true);
    const added = server(p.targets[0]);
    rmSync(c.packageRoot, { recursive: true, force: true });
    const client = new Client({ name: 'installer-fixture', version: '0.0.0' });
    const env: Record<string, string> = { ...(process.env as Record<string, string>), ZHIZHUIP_BASE_URL: 'http://127.0.0.1:1' }; delete env.ZHIZHUIP_TOKEN;
    try {
      await client.connect(new StdioClientTransport({ command: process.execPath, args: added.args, env, stderr: 'ignore' }));
      const listed = await client.listTools();
      expect(listed.tools.length).toBeGreaterThan(0); expect(listed.tools.every(t => t.annotations?.readOnlyHint)).toBe(true);
      expect(listed.tools.some(t => t.name === 'user_balance')).toBe(true);
      const resource = await client.readResource({ uri: 'zhizhuip://docs/dynamic-proxy-session' });
      expect(resource.contents[0].mimeType).toBe('text/markdown');
    } finally { await client.close(); }
  }, 60_000);
  it('复制提升的传递依赖；删除安装源后仍可启动', () => {
    const c = fixture(); const p = plan(c, ['codex']); p.readonly = true;
    expect(installFromPlan(p, 'fixture-key', c)[0].success).toBe(true);
    const added = server(p.targets[0]);
    expect(added.args[0]).toContain(join('.zhizhuip-agent-tools', 'runtimes'));
    expect(added.args[0]).not.toContain(c.packageRoot);
    rmSync(c.packageRoot, { recursive: true, force: true });
    const env = { ...process.env }; delete env.ZHIZHUIP_TOKEN;
    const out = JSON.parse(execFileSync(process.execPath, added.args, { env, encoding: 'utf8' }));
    expect(out).toEqual({ value: 'a:b', token: 'fixture-key', args: ['--readonly'] });
    const override = JSON.parse(execFileSync(process.execPath, added.args, { env: { ...env, ZHIZHUIP_TOKEN: 'env-key' }, encoding: 'utf8' }));
    expect(override.token).toBe('env-key');
  });
  it('运行文件内容变化后使用新目录，不覆盖旧运行版本', () => {
    const c = fixture(); const first = runtimeAssets(c.packageRoot).fingerprint;
    put(join(c.packageRoot, 'node_modules/dep-b/index.js'), `export default 'changed';`);
    expect(runtimeAssets(c.packageRoot).fingerprint).not.toBe(first);
  });
  it('明确缺少必需生产依赖，写入任何客户端前失败', () => {
    const c = fixture(); rmSync(join(c.packageRoot, 'node_modules/dep-b'), { recursive: true, force: true });
    const p = plan(c, ['cursor']); expect(() => installFromPlan(p, 'fixture-key', c)).toThrow('缺少生产依赖');
    expect(existsSync(p.targets[0].configPath)).toBe(false);
  });
  it('单个客户端写入失败时回滚自身，保留其他客户端成功', () => {
    const c = fixture(); const p = plan(c, ['codex', 'cursor']);
    put(join(p.targets[1].skillPath, 'SKILL.md'), '# user skill');
    chmodSync(join(p.targets[1].skillPath, 'SKILL.md'), 0o600);
    c.beforeWrite = path => { if (path === p.targets[1].configPath) throw new Error('simulated failure'); };
    const results = installFromPlan(p, 'fixture-key', c);
    expect(results.map(r => r.success)).toEqual([true, false]);
    expect(existsSync(p.targets[0].configPath)).toBe(true);
    expect(readFileSync(join(p.targets[1].skillPath, 'SKILL.md'), 'utf8')).toBe('# user skill');
    if (process.platform !== 'win32') expect(statSync(join(p.targets[1].skillPath, 'SKILL.md')).mode & 0o777).toBe(0o600);
    expect(existsSync(join(p.targets[1].skillPath, 'references/example.md'))).toBe(false);
  });
  it('同一 Skill 目录被多个客户端使用，后续失败不删除已成功内容', () => {
    const c = fixture(); const p = plan(c, ['codex', 'opencode'], 'project');
    expect(p.targets[0].skillPath).toBe(p.targets[1].skillPath);
    c.beforeWrite = path => { if (path === p.targets[1].configPath) throw new Error('simulated failure'); };
    expect(installFromPlan(p, 'fixture-key', c).map(r => r.success)).toEqual([true, false]);
    expect(readFileSync(join(p.targets[0].skillPath, 'SKILL.md'), 'utf8')).toContain('# Fixture');
  });
  it('全部客户端写入失败时恢复共享凭证', () => {
    const c = fixture(); const p = plan(c, ['cursor']); put(p.credentialPath, '{"token":"old"}\n');
    c.beforeWrite = path => { if (path === p.targets[0].configPath) throw new Error('simulated failure'); };
    expect(installFromPlan(p, 'new', c)[0].success).toBe(false);
    expect(JSON.parse(readFileSync(p.credentialPath, 'utf8')).token).toBe('old');
  });
  it('拒绝目标目录联接，不向链接指向的位置写入', () => {
    const c = fixture(); const outside = join(c.root, 'outside'); mkdirSync(outside);
    symlinkSync(outside, join(c.home, '.cursor'), process.platform === 'win32' ? 'junction' : 'dir');
    const p = plan(c, ['cursor']); expect(installFromPlan(p, 'fixture-key', c)[0].success).toBe(false);
    expect(readdirSync(outside)).toEqual([]);
  });
  it('拒绝固定运行根目录联接', () => {
    const c = fixture(); const outside = join(c.root, 'outside'); mkdirSync(outside);
    const p = plan(c, ['cursor']); symlinkSync(outside, p.managedRoot, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => installFromPlan(p, 'fixture-key', c)).toThrow('符号链接'); expect(readdirSync(outside)).toEqual([]);
  });
  it('拒绝自定义配置根的父级联接', () => {
    const c = fixture(); const outside = join(c.root, 'outside'); mkdirSync(outside);
    symlinkSync(outside, join(c.root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
    c.env.CODEX_HOME = join(c.root, 'alias/codex');
    const p = plan(c, ['codex']); expect(installFromPlan(p, 'fixture-key', c)[0].success).toBe(false);
    expect(readdirSync(outside)).toEqual([]);
  });
  it('Unix 凭证权限限制为当前用户读取', () => {
    const c = fixture(); const p = plan(c, ['cursor']); installFromPlan(p, 'fixture-key', c);
    if (process.platform !== 'win32') expect(statSync(p.credentialPath).mode & 0o777).toBe(0o600);
  });
  it('重复安装收紧未变化凭证的 Unix 权限', () => {
    const c = fixture(); const p = plan(c, ['cursor']); installFromPlan(p, 'fixture-key', c);
    chmodSync(p.credentialPath, 0o644);
    expect(installFromPlan(p, 'fixture-key', c)[0].success).toBe(true);
    if (process.platform !== 'win32') expect(statSync(p.credentialPath).mode & 0o777).toBe(0o600);
  });
});

describe('CLI 引导和无写入预览', () => {
  it.each([['--help'], ['--list']].map(args => ({ args })))('$args 不需要 Key、不写文件', async ({ args }) => {
    const c = fixture(); expect(await runInstall(args, c)).toBe(0);
    expect(c.secret).not.toHaveBeenCalled(); expect(c.fetch).not.toHaveBeenCalled(); expect(readdirSync(c.home)).toEqual([]);
  });
  it('dry-run 不读取 Key、不调用输入或验证接口、不写文件', async () => {
    const c = fixture(); c.interactive = true;
    Object.defineProperty(c.env, 'ZHIZHUIP_TOKEN', { get: () => { throw new Error('must not read token'); } });
    expect(await runInstall(['--agents', 'codex,cursor', '--dry-run'], c)).toBe(0);
    expect(c.secret).not.toHaveBeenCalled(); expect(c.fetch).not.toHaveBeenCalled(); expect(readdirSync(c.home)).toEqual([]);
  });
  it('非交互且未指定客户端时拒绝，不自动安装全部', async () => {
    const c = fixture(); c.env.ZHIZHUIP_TOKEN = 'fixture-key';
    expect(await runInstall([], c)).toBe(1); expect(c.fetch).not.toHaveBeenCalled(); expect(readdirSync(c.home)).toEqual([]);
  });
  it('缺 Key 的非交互执行不写入配置', async () => {
    const c = fixture(); expect(await runInstall(['--agents', 'cursor'], c)).toBe(1); expect(c.fetch).not.toHaveBeenCalled(); expect(readdirSync(c.home)).toEqual([]);
  });
  it('交互多选后验证输入的 Key，安装输出不回显完整 Key', async () => {
    const c = fixture(); c.interactive = true; c.ask = vi.fn(async () => 'codex,cursor');
    expect(await runInstall([], c)).toBe(0); expect(c.ask).toHaveBeenCalledOnce(); expect(c.secret).toHaveBeenCalledOnce();
    expect(c.fetch).toHaveBeenCalledOnce();
    expect(new Headers(vi.mocked(c.fetch).mock.calls[0][1]?.headers).get('token')).toBe('fixture-secret');
    expect(c.messages.join('\n')).not.toContain('fixture-secret');
  });
  it('环境 Key 优先，安装输出不包含 Key', async () => {
    const c = fixture(); c.interactive = true; c.env.ZHIZHUIP_TOKEN = ' fixture-env-key ';
    c.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(readdirSync(c.home)).toEqual([]); expect(readdirSync(c.cwd)).toEqual([]);
      expect(String(input)).toBe('https://www.zhizhuip.cc/externalapi/user/getGetUserInfo?is_mcp_send=1');
      expect(init).toMatchObject({ method: 'GET', redirect: 'error' });
      expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
        token: 'fixture-env-key', accept: 'application/json', 'accept-language': 'zh-CN', 'user-agent': 'zhizhuip mcp',
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ code: 1, data: { id: 1, email: 'private@example.test' } }));
    });
    expect(await runInstall(['--agents', 'cursor'], c)).toBe(0); expect(c.secret).not.toHaveBeenCalled();
    expect(c.fetch).toHaveBeenCalledOnce();
    expect(c.messages.join('\n')).not.toContain('fixture-env-key');
    expect(c.messages.join('\n')).not.toContain('private@example.test');
  });
  it('解析错误不泄露配置中的敏感内容', async () => {
    const c = fixture(); c.env.ZHIZHUIP_TOKEN = 'fixture-env-key'; const p = plan(c, ['codex']);
    put(p.targets[0].configPath, 'ZHIZHUIP_TOKEN = "private-malformed-secret');
    expect(await runInstall(['--agents', 'codex'], c)).toBe(1);
    expect(c.messages.join('\n')).not.toContain('private-malformed-secret');
  });
});

describe('安装前验证 API Key', () => {
  it.each([
    { name: 'HTTP 401', status: 401, body: '<html>private-profile sk-bad-key</html>', auth: true },
    { name: 'HTTP 403', status: 403, body: '{}', auth: true },
    { name: '业务 401', status: 200, body: '{"code":401,"msg":"private-profile sk-bad-key"}', auth: true },
    { name: '业务字符串 403', status: 200, body: '{"code":"403"}', auth: true },
    { name: 'HTTP 503 即使正文声称成功', status: 503, body: '{"code":1,"data":{"id":1}}' },
    { name: '业务失败', status: 200, body: '{"code":0,"msg":"private-profile sk-bad-key"}' },
    { name: '限流', status: 429, body: '{"code":0}' },
    { name: '非 JSON', status: 200, body: '<html>private-profile sk-bad-key</html>' },
    { name: 'null 响应', status: 200, body: 'null' },
    { name: '布尔值成功码', status: 200, body: '{"code":true,"data":{"id":1}}' },
    { name: '缺少用户信息', status: 200, body: '{"code":1}' },
    { name: '用户信息为数组', status: 200, body: '{"code":1,"data":[]}' },
    { name: '用户编号为零', status: 200, body: '{"code":1,"data":{"id":0}}' },
    { name: '用户编号为布尔值', status: 200, body: '{"code":1,"data":{"id":true}}' },
    { name: '用户编号为小数', status: 200, body: '{"code":1,"data":{"id":1.5}}' },
  ])('$name 拒绝安装且没有新增文件或敏感响应输出', async ({ status, body, auth }) => {
    const c = fixture(); c.env.ZHIZHUIP_TOKEN = 'sk-bad-key'; c.beforeWrite = vi.fn();
    c.fetch = vi.fn(async () => new Response(body, { status }));
    expect(await runInstall(['--agents', 'codex,cursor', '--scope', 'project'], c)).toBe(1);
    expect(c.fetch).toHaveBeenCalledOnce(); expect(c.beforeWrite).not.toHaveBeenCalled();
    expect(readdirSync(c.home)).toEqual([]); expect(readdirSync(c.cwd)).toEqual([]);
    expect(c.messages.join('\n')).toContain('API Key 验证失败');
    if (auth) expect(c.messages.join('\n')).toMatch(/无效|权限/);
    expect(c.messages.join('\n')).not.toContain('sk-bad-key');
    expect(c.messages.join('\n')).not.toContain('private-profile');
    expect(c.messages.join('\n')).not.toContain('已安装');
  });

  it.each([
    { name: '网络断开', error: new Error('private-profile sk-bad-key') },
    { name: '超时', error: new DOMException('private-profile sk-bad-key', 'TimeoutError') },
  ])('$name 停止安装并保留已有凭证、配置和 Skill', async ({ error }) => {
    const c = fixture(); c.env.ZHIZHUIP_TOKEN = 'sk-bad-key'; const p = plan(c, ['cursor']);
    const paths = [p.credentialPath, p.targets[0].configPath, join(p.targets[0].skillPath, 'SKILL.md')];
    const contents = ['{"token":"previous-key"}\n', '{"mcpServers":{"other":{"command":"keep"}}}\n', '# Existing Skill\n'];
    paths.forEach((path, index) => put(path, contents[index]));
    const beforeFiles = readdirSync(c.home, { recursive: true }).sort();
    c.fetch = vi.fn(async () => { throw error; }); c.beforeWrite = vi.fn();
    expect(await runInstall(['--agents', 'cursor'], c)).toBe(1);
    expect(c.beforeWrite).not.toHaveBeenCalled(); expect(c.fetch).toHaveBeenCalledOnce();
    expect(paths.map(path => readFileSync(path, 'utf8'))).toEqual(contents);
    expect(readdirSync(c.home, { recursive: true }).sort()).toEqual(beforeFiles);
    expect(c.messages.join('\n')).toContain('API Key 验证失败');
    expect(c.messages.join('\n')).not.toContain('sk-bad-key');
    expect(c.messages.join('\n')).not.toContain('private-profile');
  });

  it('空白交互输入不请求验证，重新输入非空 Key 后才能安装', async () => {
    const c = fixture(); c.interactive = true;
    c.secret = vi.fn().mockResolvedValueOnce('   ').mockImplementationOnce(async () => {
      expect(c.fetch).not.toHaveBeenCalled(); expect(readdirSync(c.home)).toEqual([]);
      return ' fixture-key ';
    }).mockRejectedValue(new Error('已取消安装。'));
    expect(await runInstall(['--agents', 'cursor'], c)).toBe(0);
    expect(c.secret).toHaveBeenCalledTimes(2); expect(c.fetch).toHaveBeenCalledOnce();
    expect(c.messages.join('\n')).toContain('API Key 不能为空');
    expect(new Headers(vi.mocked(c.fetch).mock.calls[0][1]?.headers).get('token')).toBe('fixture-key');
  });

  it('回环 HTTP 验证成功后安装；重新输入错误 Key 时不覆盖旧安装', async () => {
    const c = fixture(); c.fetch = fetch; c.env.ZHIZHUIP_TOKEN = 'sk-loopback-valid';
    let valid = true;
    const hits: { url?: string; method?: string; token?: string; language?: string }[] = [];
    const backend = createServer((req, res) => {
      hits.push({ url: req.url, method: req.method, token: req.headers.token as string, language: req.headers['accept-language'] });
      res.writeHead(valid ? 200 : 401, { 'content-type': 'application/json' });
      res.end(JSON.stringify(valid ? { code: '1', data: { id: '7', email: 'private@example.test' } } : { code: 401, msg: 'sk-loopback-invalid' }));
    });
    await new Promise<void>(resolve => backend.listen(0, '127.0.0.1', resolve));
    try {
      c.env.ZHIZHUIP_BASE_URL = `http://127.0.0.1:${(backend.address() as { port: number }).port}`;
      expect(await runInstall(['--agents', 'cursor'], c)).toBe(0);
      expect(hits).toEqual([{ method: 'GET', url: '/externalapi/user/getGetUserInfo?is_mcp_send=1', token: 'sk-loopback-valid', language: 'zh-CN' }]);
      const p = plan(c, ['cursor']); const paths = [p.credentialPath, p.targets[0].configPath];
      const before = paths.map(path => readFileSync(path)); const beforeFiles = readdirSync(c.home, { recursive: true }).sort();
      valid = false; c.env.ZHIZHUIP_TOKEN = 'sk-loopback-invalid';
      expect(await runInstall(['--agents', 'cursor'], c)).toBe(1);
      expect(hits).toHaveLength(2); expect(hits[1].token).toBe('sk-loopback-invalid');
      expect(paths.map(path => readFileSync(path))).toEqual(before);
      expect(readdirSync(c.home, { recursive: true }).sort()).toEqual(beforeFiles);
      expect(c.messages.join('\n')).not.toContain('sk-loopback-valid');
      expect(c.messages.join('\n')).not.toContain('sk-loopback-invalid');
      expect(c.messages.join('\n')).not.toContain('private@example.test');
    } finally {
      backend.closeAllConnections();
      await new Promise<void>((resolve, reject) => backend.close(error => error ? reject(error) : resolve()));
    }
  });
});

describe('交互输入验证失败后重试', () => {
  it('连续输错后留在同一次安装，只有最后验证通过的 Key 被保存', async () => {
    const c = fixture(); c.interactive = true; c.ask = vi.fn(async () => 'cursor'); c.beforeWrite = vi.fn();
    const tokens = ['fixture-bad-one', 'fixture-bad-two', 'fixture-valid'];
    c.secret = vi.fn().mockResolvedValueOnce(tokens[0]).mockResolvedValueOnce(tokens[1])
      .mockResolvedValueOnce(tokens[2]).mockRejectedValue(new Error('已取消安装。'));
    let requests = 0;
    c.fetch = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(c.beforeWrite).not.toHaveBeenCalled(); expect(readdirSync(c.home)).toEqual([]);
      expect(new Headers(init?.headers).get('token')).toBe(tokens[requests]);
      requests++;
      return new Response(JSON.stringify(requests < 3 ? { code: 401, msg: 'private-response' } : { code: 1, data: { id: 1 } }));
    });
    expect(await runInstall([], c)).toBe(0);
    expect(c.ask).toHaveBeenCalledOnce(); expect(c.secret).toHaveBeenCalledTimes(3); expect(c.fetch).toHaveBeenCalledTimes(3);
    expect(c.beforeWrite).toHaveBeenCalled();
    expect(JSON.parse(readFileSync(plan(c, ['cursor']).credentialPath, 'utf8')).token).toBe(tokens[2]);
    expect(c.messages.filter(message => message.startsWith('API Key 验证失败'))).toHaveLength(2);
    expect(c.messages.filter(message => message === 'API Key 验证通过，开始安装。')).toHaveLength(1);
    for (const secret of [...tokens, 'private-response']) expect(c.messages.join('\n')).not.toContain(secret);
  });

  it.each([
    { name: '网络断开', error: new Error('private-response') },
    { name: '超时', error: new DOMException('private-response', 'TimeoutError') },
    { name: '非 JSON 响应' },
  ])('$name 后等待用户重新输入，不自动重复请求', async ({ error }) => {
    const c = fixture(); c.interactive = true; c.beforeWrite = vi.fn();
    c.secret = vi.fn().mockResolvedValueOnce('fixture-key').mockImplementationOnce(async () => {
      expect(c.fetch).toHaveBeenCalledOnce(); expect(c.beforeWrite).not.toHaveBeenCalled();
      expect(readdirSync(c.home)).toEqual([]);
      return 'fixture-key';
    }).mockRejectedValue(new Error('已取消安装。'));
    let requests = 0;
    c.fetch = vi.fn(async () => {
      if (++requests === 1) {
        if (error) throw error;
        return new Response('<html>private-response</html>');
      }
      return new Response('{"code":1,"data":{"id":1}}');
    });
    expect(await runInstall(['--agents', 'cursor'], c)).toBe(0);
    expect(c.fetch).toHaveBeenCalledTimes(2); expect(c.secret).toHaveBeenCalledTimes(2);
    expect(c.messages.join('\n')).toContain('请核对 Key 或网络后重新输入；Ctrl+C 取消。');
    expect(c.messages.join('\n')).not.toContain('private-response');
  });

  it('失败后取消不再验证，也不覆盖已有安装', async () => {
    const c = fixture(); c.interactive = true; c.beforeWrite = vi.fn(); const p = plan(c, ['cursor']);
    const paths = [p.credentialPath, p.targets[0].configPath, join(p.targets[0].skillPath, 'SKILL.md')];
    const contents = ['{"token":"previous-key"}', '{"mcpServers":{"other":{"command":"keep"}}}', '# Existing Skill'];
    paths.forEach((path, index) => put(path, contents[index]));
    const files = readdirSync(c.home, { recursive: true }).sort();
    c.secret = vi.fn().mockResolvedValueOnce('fixture-bad-key').mockRejectedValue(new Error('已取消安装。'));
    c.fetch = vi.fn(async () => new Response('{"code":401}', { status: 401 }));
    expect(await runInstall(['--agents', 'cursor'], c)).toBe(1);
    expect(c.fetch).toHaveBeenCalledOnce(); expect(c.secret).toHaveBeenCalledTimes(2);
    expect(c.beforeWrite).not.toHaveBeenCalled();
    expect(paths.map(path => readFileSync(path, 'utf8'))).toEqual(contents);
    expect(readdirSync(c.home, { recursive: true }).sort()).toEqual(files);
    expect(c.messages.at(-1)).toBe('已取消安装。');
  });

  it('环境变量 Key 失败时即使终端可交互也退出，不切换输入来源', async () => {
    const c = fixture(); c.interactive = true; c.env.ZHIZHUIP_TOKEN = 'fixture-env-key';
    c.fetch = vi.fn(async () => new Response('{"code":401}', { status: 401 }));
    expect(await runInstall(['--agents', 'cursor'], c)).toBe(1);
    expect(c.fetch).toHaveBeenCalledOnce(); expect(c.secret).not.toHaveBeenCalled();
    expect(readdirSync(c.home)).toEqual([]); expect(c.env.ZHIZHUIP_TOKEN).toBe('fixture-env-key');
  });

  it('接口配置异常直接退出，不把重新输入 Key 当作配置修复', async () => {
    const c = fixture(); c.interactive = true; c.env.ZHIZHUIP_TIMEOUT_MS = 'invalid';
    expect(await runInstall(['--agents', 'cursor'], c)).toBe(1);
    expect(c.secret).toHaveBeenCalledOnce(); expect(c.fetch).not.toHaveBeenCalled();
    expect(readdirSync(c.home)).toEqual([]);
  });
});

describe('API Key 输入展示', () => {
  it.each([
    ['', ''], ['sk-1234', 'sk-1234'], ['12345678', '12345678'],
    ['sk-123456', 'sk-1*3456'], ['sk-1234567890abcd', 'sk-1********abcd'],
    ['sk-' + 'a'.repeat(64) + 'wxyz', 'sk-a********wxyz'],
  ])('输入 %s 时显示 %s', (input, expected) => {
    expect(formatTokenInput(input)).toBe(expected);
    expect(formatTokenInput(input).length).toBeLessThanOrEqual(16);
  });
});
