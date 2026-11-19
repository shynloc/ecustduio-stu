import pathlib,shutil,tempfile,subprocess,json,hashlib,zipfile,datetime,sys
app=pathlib.Path(__file__).resolve().parent.parent
version=json.loads((app/'package.json').read_text(encoding='utf-8'))['version']
output=pathlib.Path(sys.argv[1]).resolve();output.mkdir(parents=True,exist_ok=True)
staging=app/'.artifacts'/'staging';staging.mkdir(parents=True,exist_ok=True)
stage=pathlib.Path(tempfile.mkdtemp(prefix=f'macos-{version}-',dir=staging));product=stage/'app';product.mkdir()
for name in ['server','web','shared','migrations','skills','public','vendor','dist','dist-server']:
    shutil.copytree(app/name,product/name,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
for name in ['package.json','package-lock.json','tsconfig.json','tsconfig.server.json','vite.config.ts','.env.example','.gitignore']:
    shutil.copy2(app/name,product/name)
(product/'scripts').mkdir()
shutil.copy2(app/'HANDOFF.md',product/'HANDOFF.md')
shutil.copy2(app/'README.md',product/'DEVELOPMENT_README.md')
shutil.copytree(app/'docs'/'plans',product/'docs'/'plans')
for doc in ['MAC_DEVELOPMENT.md','DEVELOPMENT_DIRECTION.md','NEXT_AGENT_PROMPT.md','0.11.0开发与验证记录.md','0.11.0使用指南.md','0.11.0发布与升级说明.md','公众号主题选择器与复制-2026-11-19.md']:shutil.copy2(app/'docs'/doc,product/'docs'/doc)
for name in ['update-protocol.mjs','update-runner.mjs','upgrade.mjs','sync-update-runtime.mjs','macos-ocr.js','macos-service.mjs','macos-native-selftest.mjs','macos-keychain-check.mjs','macos-save-deepseek.mjs','diagnose-runtime.mjs','customer-selftest.mjs','setup-gif-runtime.mjs','gif-factory-export.py','gif-factory-decode.py','windows-ocr.ps1']:
    shutil.copy2(app/'scripts'/name,product/'scripts'/name)
for file in (app/'deployment'/'macos').iterdir():
    if file.is_file():shutil.copy2(file,stage/file.name)
for name in ['upgrade.mjs','在线升级使用指南.md','升级指南.md','升级验证记录.md','升级验证记录.json']:shutil.copy2(app/'deployment'/name,stage/name)
for name in ['0.11.0发布与升级说明.md','0.11.0本地Agent安装升级提示词.md','0.11.0开发与验证记录.md','0.11.0使用指南.md','0.10.0发布与升级说明.md','0.10.0本地Agent安装升级提示词.md','0.10.0开发与验证记录.md','0.9.0发布与升级说明.md','0.9.0本地Agent安装升级提示词.md','0.9.0开发与验证记录.md','0.8.4发布与升级说明.md','0.8.4本地Agent安装升级提示词.md','0.8.4开发与验证记录.md','0.8.3发布与升级说明.md','0.8.3本地Agent安装升级提示词.md','0.8.3开发与验证记录.md','0.8.2发布与升级说明.md','0.8.2本地Agent安装升级提示词.md','0.8.2开发与验证记录.md','0.8.1发布与升级说明.md','0.8.1本地Agent安装升级提示词.md','0.8.1开发与验证记录.md','0.8.0发布与升级说明.md','0.8.0本地Agent安装升级提示词.md','0.8.0视觉创作使用指南.md','0.8.0开发与验证记录.md','0.7.0发布与升级说明.md','0.7.0本地Agent安装升级提示词.md','0.7.0视觉创作使用指南.md','0.7.0开发与验证记录.md','0.6.0使用与升级指南.md','0.6.0开发说明.md','0.6.0验证记录.md','DeepSeek文件图像语音使用指南.md','DeepSeek媒体验证记录.md','DeepSeek媒体验证记录.json','DeepSeek媒体流程验证.json','DeepSeek能力升级说明.md','DeepSeek升级验证记录.json','DeepSeek升级验证记录.md']:shutil.copy2(app/'docs'/name,stage/name)
if (app/'docs'/'product').exists():shutil.copytree(app/'docs'/'product',stage/'docs'/'原始PRD与开发文档')
readme=f'# EcuStudio {version} · macOS联网安装/升级版 · upgrade1\n\n目标macOS14及以上，自动识别Apple Silicon和Intel。新用户运行Install.command；旧用户将包解压到原安装目录之外的新文件夹，运行Upgrade.command。自动备份并保留账号、资料、设置与原钥匙串配置。详见升级指南.md和先读我.html。\n\n默认安装到~/Library/Application Support/EcuStudio。使用原Mac登录用户，不使用sudo；原安装路径保持不变。首次安装下载运行环境，升级优先复用依赖。\n\n钥匙串、Vision、LaunchAgent和Mac升级器尚未在Mac实机验收；随包提供自检。产品源码在app/server、web、shared，已构建内容在app/dist和dist-server。包内没有业务库、账号或密钥。\n'
(stage/'README.md').write_text(readme,encoding='utf-8');(product/'README.md').write_text(readme,encoding='utf-8')
subprocess.run(['node',str(app/'scripts'/'render-macos-docs.mjs'),str(stage)],cwd=app,check=True)
files=[]
for file in sorted(stage.rglob('*')):
    if not file.is_file():continue
    if file.name in ['.env','secrets.dpapi','secrets.keychain.json'] or file.suffix in ['.sqlite','.keychain']:raise RuntimeError('Private file in package')
    raw=file.read_bytes()
    if file.suffix in ['.command','.sh','.js','.mjs','.ts','.tsx','.json','.md','.html','.css','.ps1']:
        raw=raw.replace(b'\r\n',b'\n');file.write_bytes(raw)
    files.append(dict(path=file.relative_to(stage).as_posix(),bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest()))
manifest=dict(product='EcuStudio教创工作台',version=version,installerRevision='online-update1',platform='macOS14+',architectures=['arm64','x64'],kind='online-installer-and-upgrader',nativeMacValidation='pending_customer_selftest',createdAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),files=files)
(stage/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
archive=output/f'EcuStudio-{version}-macOS-UpgradeReady.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for file in sorted(stage.rglob('*')):
        if not file.is_file():continue
        info=zipfile.ZipInfo(file.relative_to(stage).as_posix(),datetime.datetime.now().timetuple()[:6]);info.create_system=3
        mode=0o100755 if file.suffix in ['.command','.sh'] else 0o100644
        info.external_attr=mode<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,file.read_bytes())
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
(output/(archive.name+'.sha256')).write_text(digest+'  '+archive.name+'\n',encoding='ascii')
for name in ['产品说明.md','Mac安装与使用指南.md','本地Agent安装启动提示词.md']:shutil.copy2(stage/name,output/name)
result=dict(version=version,archive=str(archive),bytes=archive.stat().st_size,sha256=digest,files=len(files)+1,packagerPlatform=sys.platform,macNativeValidation='see_version_acceptance_and_customer_selftest',validation='See version acceptance for macOS product CI; interactive Keychain, Vision and LaunchAgent require native user-session selftest')
(output/'release.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
