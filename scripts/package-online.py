"""Build a clean Windows online installer; never copy business data or credentials."""
import pathlib, tempfile, shutil, json, zipfile, hashlib, sys, datetime, subprocess
app = pathlib.Path(__file__).resolve().parent.parent
version = json.loads((app/'package.json').read_text(encoding='utf-8'))['version']
output = pathlib.Path(sys.argv[1]).resolve(); output.mkdir(parents=True, exist_ok=True)
(app/'.artifacts'/'staging').mkdir(parents=True,exist_ok=True)
stage = pathlib.Path(tempfile.mkdtemp(prefix=f'windows-online-{version}-', dir=app/'.artifacts'/'staging'))
product = stage/'app'; product.mkdir()
for name in ['server','web','shared','migrations','skills','public','dist','dist-server']:
    shutil.copytree(app/name, product/name, ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
for name in ['package.json','package-lock.json','tsconfig.json','tsconfig.server.json','vite.config.ts','.env.example','.gitignore']:
    shutil.copy2(app/name, product/name)
(product/'scripts').mkdir()
for name in ['update-protocol.mjs','update-runner.mjs','upgrade.mjs','sync-update-runtime.mjs','windows-ocr.ps1','macos-ocr.js','diagnose-runtime.mjs','customer-selftest.mjs','setup-gif-runtime.mjs','gif-factory-export.py','gif-factory-decode.py','authenticated-session.ts']:
    shutil.copy2(app/'scripts'/name, product/'scripts'/name)
for file in (app/'deployment').iterdir():
    if file.is_file(): shutil.copy2(file, stage/file.name)
for name in ['0.10.0发布与升级说明.md','0.10.0本地Agent安装升级提示词.md','0.10.0开发与验证记录.md','0.9.0发布与升级说明.md','0.9.0本地Agent安装升级提示词.md','0.9.0开发与验证记录.md','0.8.4发布与升级说明.md','0.8.4本地Agent安装升级提示词.md','0.8.4开发与验证记录.md','0.8.3发布与升级说明.md','0.8.3本地Agent安装升级提示词.md','0.8.3开发与验证记录.md','0.8.2发布与升级说明.md','0.8.2本地Agent安装升级提示词.md','0.8.2开发与验证记录.md','0.8.1发布与升级说明.md','0.8.1本地Agent安装升级提示词.md','0.8.1开发与验证记录.md','0.8.0发布与升级说明.md','0.8.0本地Agent安装升级提示词.md','0.8.0视觉创作使用指南.md','0.8.0开发与验证记录.md','0.7.0发布与升级说明.md','0.7.0本地Agent安装升级提示词.md','0.7.0视觉创作使用指南.md','0.7.0开发与验证记录.md','0.6.0使用与升级指南.md','0.6.0开发说明.md','0.6.0验证记录.md','DeepSeek文件图像语音使用指南.md','DeepSeek媒体验证记录.md','DeepSeek媒体验证记录.json','DeepSeek媒体流程验证.json','DeepSeek能力升级说明.md','DeepSeek升级验证记录.md','DeepSeek升级验证记录.json']:
    shutil.copy2(app/'docs'/name,stage/name)
shutil.copytree(app/'docs'/'product',stage/'docs'/'原始PRD与开发文档')
for name in ['产品说明.md','详细使用指南.md','本地Agent安装启动提示词.md']:
    p=stage/name; s=p.read_text(encoding='utf-8')
    s=s.replace('Install-EcuStudio.ps1','Install-Online.ps1')
    s=s.replace('完整ZIP包含构建产物、源码、Windows x64 Node运行环境、生产依赖、PDF浏览器、安装启动脚本、原有PRD和开发文档、本说明和使用指南。','联网ZIP包含构建产物、源码、安装启动脚本、原有PRD和开发文档、本说明和使用指南。Node、生产依赖和PDF浏览器在首次安装时下载。')
    s=s.replace('使用随包Node','下载并校验官方Node').replace('完整包正常安装无需下载这些核心依赖；修复损坏文件时可能需要联网。','联网安装版首次安装需要网络；按锁文件安装依赖。')
    s=s.replace('脚本会使用自带Node、生产依赖和PDF浏览器，必要时尝试联网修复。','脚本会联网下载并校验Node，安装锁定的生产依赖和PDF浏览器。')
    p.write_text(s,encoding='utf-8')
    shutil.copy2(p,output/name)
(stage/'Install-EcuStudio.cmd').write_bytes(b'@echo off\r\ncd /d "%~dp0"\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Online.ps1" %*\r\nif errorlevel 1 pause\r\n')
readme=f'# EcuStudio {version} Windows 联网安装/升级版 · upgrade1\n\n新用户完整解压后双击「一键安装.cmd」。旧用户将包解压到原安装目录之外的新文件夹，双击「一键升级.cmd」。自动识别旧安装、备份、迁移、校验与启动，账号/资料/配置保留。详见「升级指南.md」和「先读我.html」。\n\n首次安装必须联网下载Node、依赖和PDF浏览器。升级优先复用原依赖，缺失或依赖变化时联网下载。无业务库、账号、密钥或运行环境随包分发。\n'
(stage/'README.md').write_text(readme,encoding='utf-8'); (product/'README.md').write_text(readme,encoding='utf-8')
subprocess.run(['node',str(app/'scripts'/'render-online-docs.mjs'),str(stage)],cwd=app,check=True)
files=[]
for file in sorted(stage.rglob('*')):
    if not file.is_file():continue
    if file.name in ['.env','secrets.dpapi','secrets.keychain.json'] or file.suffix in ['.sqlite','.dpapi']:raise RuntimeError('Private file in package')
    raw=file.read_bytes();files.append(dict(path=file.relative_to(stage).as_posix(),bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest()))
(stage/'manifest.json').write_text(json.dumps(dict(product='EcuStudio教创工作台',version=version,installerRevision='online-update1',platform='Windows-x64',kind='online-installer-and-upgrader',files=files),ensure_ascii=False,indent=2),encoding='utf-8')
archive=output/f'EcuStudio-{version}-Windows-x64-UpgradeReady.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for file in sorted(stage.rglob('*')):
        if file.is_file():z.write(file,file.relative_to(stage).as_posix())
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
(output/(archive.name+'.sha256')).write_text(digest+'  '+archive.name+'\n',encoding='ascii')
result=dict(version=version,archive=str(archive),bytes=archive.stat().st_size,sha256=digest,files=len(files)+1)
(output/'release.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
