#!/usr/bin/env python3
"""Build ARM64 standalone beta from compiled Core, official Node Mobile and Android NDK.
Required env: ANDROID_TOOLS, ANDROID_JAR, ANDROID_NDK_HOME, NODE_MOBILE_DIR,
ECJ_JAR, COMPANION_SIGNING_KEY, COMPANION_SIGNING_PASSWORD.
Optional: COMPANION_SIGNING_ALIAS (default companioncore).
Signing certificate must match signing-certificate.json; keys never enter Git.
"""
from pathlib import Path
import os,subprocess,shutil,zipfile,json,hashlib
import xml.etree.ElementTree as ET
root=Path(__file__).resolve().parent; repo=root.parent; app=root/'app'; build=root/'build';build.mkdir(exist_ok=True)
bt=Path(os.environ['ANDROID_TOOLS']); android=Path(os.environ['ANDROID_JAR']); ndk=Path(os.environ['ANDROID_NDK_HOME'])/'toolchains/llvm/prebuilt/linux-x86_64'; node=Path(os.environ['NODE_MOBILE_DIR'])
def run(a): subprocess.run([str(x) for x in a],check=True)
# Refuse accidental key rotation; APK signing is independent of Companion identities.
signing_key=Path(os.environ['COMPANION_SIGNING_KEY'])
signing_alias=os.environ.get('COMPANION_SIGNING_ALIAS','companioncore')
if not os.environ.get('COMPANION_SIGNING_PASSWORD'):
 raise RuntimeError('Set COMPANION_SIGNING_PASSWORD through a private environment variable.')
expected=json.loads((root/'signing-certificate.json').read_text())['certificateSha256']
certificate=subprocess.check_output(['keytool','-exportcert','-keystore',str(signing_key),'-alias',signing_alias,'-storepass:env','COMPANION_SIGNING_PASSWORD'])
if hashlib.sha256(certificate).hexdigest()!=expected:
 raise RuntimeError('Signing certificate differs from the pinned release certificate. Do not rotate it for an update.')
version=ET.parse(app/'AndroidManifest.xml').getroot().get('{http://schemas.android.com/apk/res/android}versionName')
if not version: raise RuntimeError('Missing Android versionName.')
for name in ['classes','dex','generated','lib/arm64-v8a','assets/core']:(build/name).mkdir(parents=True,exist_ok=True)
assets=build/'assets/core'
for name in ['web']:
 if (assets/name).exists():shutil.rmtree(assets/name)
 shutil.copytree(repo/name,assets/name)
for old in ['dist','bootstrap.mjs']:
 if (assets/old).is_dir():shutil.rmtree(assets/old)
 elif (assets/old).exists():(assets/old).unlink()
shutil.copyfile(root/'bootstrap.cjs',assets/'bootstrap.cjs')
run(['node',repo/'scripts/build-android-server.mjs'])
if (root/'notices').exists():shutil.copytree(root/'notices',assets/'notices',dirs_exist_ok=True)
(assets/'package.json').write_text('{"type":"module"}')
# App-owned private capability cookie means no external browser can use this local server.
libs=build/'lib/arm64-v8a'
shutil.copyfile(node/'bin/arm64-v8a/libnode.so',libs/'libnode.so')
shutil.copyfile(ndk/'sysroot/usr/lib/aarch64-linux-android/libc++_shared.so',libs/'libc++_shared.so')
run([ndk/'bin/aarch64-linux-android26-clang','-shared','-fPIC','-O2','-Wl,-z,max-page-size=16384',app/'native/core.c','-L'+str(libs),'-lnode','-o',libs/'libcompanion.so'])
# Statically linked llama.cpp server built from pinned source; executable lives in nativeLibraryDir.
shutil.copyfile(Path(os.environ['LLAMA_ANDROID_SERVER']),libs/'libllama-server.so')
run([ndk/'bin/aarch64-linux-android26-clang','-fPIE','-pie','-O2','-Wl,-z,max-page-size=16384',app/'native/local-runner.c','-o',libs/'liblocal-runner.so'])
run([bt/'aapt','package','-f','-m','-J',build/'generated','-M',app/'AndroidManifest.xml','-S',app/'res','-A',build/'assets','-I',android,'-F',build/'resources.apk'])
run(['java','-jar',os.environ['ECJ_JAR'],'-1.8','-proc:none','-bootclasspath',str(android)+os.pathsep+str(bt/'core-lambda-stubs.jar'),'-d',build/'classes',*app.glob('src/**/*.java')])
run([bt/'d8','--lib',android,'--min-api','26','--output',build/'dex',*(build/'classes').glob('**/*.class')])
shutil.copyfile(build/'resources.apk',build/'unsigned.apk')
with zipfile.ZipFile(build/'unsigned.apk','a',zipfile.ZIP_DEFLATED) as z:
 z.write(build/'dex/classes.dex','classes.dex')
 for f in libs.glob('*.so'):z.write(f,'lib/arm64-v8a/'+f.name)
run([bt/'zipalign','-f','4',build/'unsigned.apk',build/'aligned.apk'])
out=build/('companion-core-standalone-v'+version.replace('-beta','')+'-arm64-beta.apk')
run([bt/'apksigner','sign','--ks',signing_key,'--ks-key-alias',signing_alias,'--ks-pass','env:COMPANION_SIGNING_PASSWORD','--out',out,build/'aligned.apk'])
run([bt/'apksigner','verify','--verbose','--print-certs',out]);run([bt/'aapt','dump','badging',out]);print(out)
