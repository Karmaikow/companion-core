package com.companioncore.mobile;

import android.app.*;
import android.os.*;
import android.content.*;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.net.*;
import java.security.SecureRandom;
import java.util.*;
import org.json.JSONObject;

/** Embedded Core beta. Data stays in app-private storage; no Termux dependency. */
public final class MainActivity extends Activity {
 private static final String ORIGIN="http://127.0.0.1:4187";
 private boolean bound=false;
 private Messenger coreMessenger;
 private boolean coreReady=false;
 private boolean polling=false;
 private LinearLayout root;
 private Button startButton;
 private final ServiceConnection connection=new ServiceConnection(){
  @Override public void onServiceConnected(ComponentName name,IBinder binder){try{
   Message message=Message.obtain(null,1);Bundle data=new Bundle();data.putString("token",token);message.setData(data);coreMessenger=new Messenger(binder);coreMessenger.send(message);
   status.setText("Preparando o Refúgio…");polling=true;poll();
  }catch(Exception e){fail("Não foi possível comunicar com o Core.");}}
  @Override public void onServiceDisconnected(ComponentName name){releaseCore();fail("O Core foi interrompido. A interface foi preservada. Toque em Diagnóstico para conferir o motivo.");}
  @Override public void onBindingDied(ComponentName name){releaseCore();fail("A conexão com o Core foi encerrada. Confira o Diagnóstico.");}
  @Override public void onNullBinding(ComponentName name){releaseCore();fail("O serviço interno não respondeu.");}
 };
 private static String token;
 private static volatile String failure;
 static native int startCore(String root,String secret);
 private WebView web;
 private TextView status;
 private ValueCallback<Uri[]> chooser;
 private byte[] pendingExport;
 private boolean loaded=false;
 private final Handler handler=new Handler(Looper.getMainLooper());
 private int attempts=0;
 private static final int OPEN=41,SAVE=42;
 private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
 private Button button(String label,Runnable action){
  Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextSize(13);b.setTextColor(Color.rgb(224,221,255));b.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));
  GradientDrawable bg=new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{Color.rgb(38,38,76),Color.rgb(19,23,47)});bg.setCornerRadius(dp(14));bg.setStroke(dp(1),Color.rgb(102,97,160));b.setBackground(bg);b.setPadding(dp(10),0,dp(10),0);b.setMinHeight(0);b.setMinimumHeight(0);
  b.setOnClickListener(v->{b.animate().alpha(.65f).setDuration(80).withEndAction(()->b.animate().alpha(1f).setDuration(140));action.run();});return b;
 }
 private LinearLayout.LayoutParams tab(){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(44),1);p.setMargins(dp(4),0,dp(4),0);return p;}
 private void releaseCore(){polling=false;coreMessenger=null;if(bound){bound=false;try{unbindService(connection);}catch(Exception ignored){}}}
 private boolean beginFileTransfer(){
  if(!bound){show("Abra o Refúgio antes de selecionar o Cristal.");return false;}
  try{startForegroundService(new Intent(this,CoreService.class));return true;}
  catch(Exception e){show("Não foi possível manter o Core ativo para selecionar o arquivo: "+e.getClass().getSimpleName());return false;}
 }
 private void endFileTransfer(){
  if(!bound)return;
  // Messenger is obtained from the same private binding; no external service can receive it.
  if(coreMessenger!=null)try{coreMessenger.send(Message.obtain(null,2));}catch(Exception ignored){}
 }
 private void fail(String message){polling=false;failure=message;status.setText(message);if(startButton!=null)startButton.setVisibility(View.VISIBLE);}
 private void start(){
  if(bound)return;
  failure=null;attempts=0;loaded=false;coreReady=false;
  if(android.system.Os.sysconf(android.system.OsConstants._SC_PAGESIZE)>4096){fail("Este aparelho usa páginas de memória de 16 KB. O runtime desta beta ainda precisa de uma compilação compatível. Toque em Diagnóstico.");return;}
  byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);token=android.util.Base64.encodeToString(bytes,android.util.Base64.NO_WRAP);
  status.setText("Conectando ao Core do aplicativo…");startButton.setVisibility(View.GONE);
  try{startForegroundService(new Intent(this,CoreService.class));bound=bindService(new Intent(this,CoreService.class),connection,BIND_AUTO_CREATE);if(!bound){stopService(new Intent(this,CoreService.class));fail("Não foi possível iniciar o serviço interno.");}}catch(Exception e){stopService(new Intent(this,CoreService.class));fail("Falha ao iniciar serviço: "+e.getClass().getSimpleName());}
 }
 private String privateText(String filename){try{try(RandomAccessFile file=new RandomAccessFile(new File(getFilesDir(),filename),"r")){long offset=Math.max(0,file.length()-16384);file.seek(offset);byte[] bytes=new byte[(int)(file.length()-offset)];file.readFully(bytes);return (offset>0?"(últimos 16 KB)\n":"")+new String(bytes,"UTF-8");}}catch(Exception e){return "(sem registro)";}}
 private void diagnostics(){
  StringBuilder report=new StringBuilder("Companion Core 0.4.5 · diagnóstico\n");
  report.append(Build.MANUFACTURER).append(" ").append(Build.MODEL).append("\nAndroid ").append(Build.VERSION.RELEASE).append(" / API ").append(Build.VERSION.SDK_INT).append("\nABI: ").append(Arrays.toString(Build.SUPPORTED_ABIS));
  report.append("\nPágina de memória: ").append(android.system.Os.sysconf(android.system.OsConstants._SC_PAGESIZE));
  try{android.content.pm.PackageInfo info=WebView.getCurrentWebViewPackage();report.append("\nWebView: ").append(info==null?"indisponível":info.versionName);}catch(Exception ignored){}
  report.append("\nEtapa: ").append(privateText("core-startup-stage.txt"));
  if(failure!=null)report.append("\nInterface: ").append(failure);
  if(Build.VERSION.SDK_INT>=30){try{for(ApplicationExitInfo exit:((ActivityManager)getSystemService(ACTIVITY_SERVICE)).getHistoricalProcessExitReasons(getPackageName(),0,4)){report.append("\nSaída ").append(exit.getProcessName()).append(": motivo=").append(exit.getReason()).append(" código=").append(exit.getStatus()).append(" em ").append(new java.util.Date(exit.getTimestamp()));}}catch(Exception ignored){}}
  report.append("\n\nCiclo do serviço:\n").append(privateText("core-lifecycle.log"));
  report.append("\n\nInicialização:\n").append(privateText("core-startup.log"));
  final String value=report.toString();TextView text=new TextView(this);text.setText(value);text.setTextIsSelectable(true);text.setTextSize(12);text.setPadding(dp(18),dp(12),dp(18),dp(12));ScrollView scroll=new ScrollView(this);scroll.addView(text);
  new AlertDialog.Builder(this).setTitle("Diagnóstico do aplicativo").setView(scroll).setPositiveButton("Copiar",(d,w)->{((ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Diagnóstico Companion Core",value));Toast.makeText(this,"Diagnóstico copiado",Toast.LENGTH_SHORT).show();}).setNegativeButton("Fechar",null).show();
 }
 @Override public void onCreate(Bundle saved){
  super.onCreate(saved);
  root=new LinearLayout(this);root.setOrientation(1);root.setBackgroundColor(Color.rgb(8,13,34));root.setFitsSystemWindows(true);
  if(Build.VERSION.SDK_INT>=30)root.setOnApplyWindowInsetsListener((v,i)->{android.graphics.Insets b=i.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());v.setPadding(b.left,b.top,b.right,b.bottom);return i;});
  TextView brand=new TextView(this);brand.setText("◇  COMPANION CORE");brand.setTextColor(Color.rgb(205,193,250));brand.setTextSize(18);brand.setLetterSpacing(.15f);brand.setPadding(dp(20),dp(18),dp(20),dp(12));root.addView(brand);
  LinearLayout bar=new LinearLayout(this);bar.setPadding(dp(8),dp(4),dp(8),dp(10));
  bar.addView(button("◇ Refúgio",()->{if(loaded)web.loadUrl(ORIGIN+"/");}),tab());
  bar.addView(button("✧ Conversa",()->settings()),tab());
  bar.addView(button("? Ajuda",()->new AlertDialog.Builder(this).setTitle("Companion Core · beta 0.4.5").setMessage("O Core roda dentro deste APK. Crie seu acesso local e importe o Cristal no Hub.\n\nO chat livre precisa de um servidor Ollama HTTPS configurado em IA. Nenhum modelo está incluído.\n\nTransferências precisam de internet. Não desinstale o app nem limpe seus dados sem exportar o Cristal.\n\nA sessão permanece ativa ao alternar de app. Feche o Companion Core para encerrá-la. O login local ainda é separado da conta web.").setPositiveButton("Entendi",null).show()),tab());
  root.addView(bar);
  status=new TextView(this);status.setTextColor(Color.WHITE);status.setPadding(dp(12),dp(8),dp(12),dp(8));status.setText("Seu Refúgio no celular. Inicie o Core para entrar.");root.addView(status);
  LinearLayout actions=new LinearLayout(this);actions.setPadding(dp(12),dp(4),dp(12),dp(12));startButton=button("Abrir meu Refúgio",()->start());actions.addView(startButton,tab());actions.addView(button("Diagnóstico",()->diagnostics()),tab());root.addView(actions);
  web=new WebView(this);web.setBackgroundColor(Color.rgb(8,13,34));WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(true);s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSupportMultipleWindows(false);
  android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  web.addJavascriptInterface(new ExportBridge(),"CompanionAndroid");
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){return !allowed(r.getUrl());}
   @Override public WebResourceResponse shouldInterceptRequest(WebView w,WebResourceRequest r){return allowed(r.getUrl())?null:blocked();}
   @Override public void onReceivedSslError(WebView w,SslErrorHandler h,android.net.http.SslError e){h.cancel();}
   @Override public void onReceivedError(WebView w,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame())status.setText("Não foi possível abrir o Core. Feche e abra o aplicativo; seus dados permanecem guardados.");}
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onShowFileChooser(WebView w,ValueCallback<Uri[]> cb,FileChooserParams params){
    if(chooser!=null)chooser.onReceiveValue(null);
    if(!beginFileTransfer()){cb.onReceiveValue(null);return true;}chooser=cb;
    Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");
    try{startActivityForResult(i,OPEN);}catch(Exception e){chooser.onReceiveValue(null);chooser=null;endFileTransfer();}return true;
   }
  });
  ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient(){@Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest r){return allowed(r.getUrl())?null:blocked();}});
  root.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
  // Start explicitly so diagnostics remain reachable even before native initialization.
 }
 private static boolean allowed(Uri u){return "http".equals(u.getScheme())&&"127.0.0.1".equals(u.getHost())&&u.getPort()==4187&&u.getUserInfo()==null;}
 private static WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
 private void poll(){if(!polling)return;new Thread(()->{
  boolean ready=false;HttpURLConnection c=null;
  try{c=(HttpURLConnection)new URL(ORIGIN+"/api/health").openConnection();c.setConnectTimeout(1000);c.setReadTimeout(1000);c.setRequestProperty("X-Companion-App",token);ready=c.getResponseCode()==200;}catch(Exception ignored){}finally{if(c!=null)c.disconnect();}
  final boolean ok=ready;runOnUiThread(()->{
   if(isDestroyed()||isFinishing()||!polling)return;
   if(ok){coreReady=true;polling=false;android.webkit.CookieManager.getInstance().setCookie(ORIGIN,"companion_app="+token+"; Path=/; HttpOnly; SameSite=Strict",v->{android.webkit.CookieManager.getInstance().flush();loaded=true;status.setText("Core no APK · chat livre: configure Ollama em IA");web.loadUrl(ORIGIN+"/");});}
   else if(failure!=null)status.setText(failure);
   else if(++attempts<45){status.setText(privateText("core-startup-stage.txt"));if(status.getText().toString().startsWith("Falha:")||status.getText().toString().startsWith("Core encerrado")){fail("O Core não iniciou. Abra o Diagnóstico.");releaseCore();}else handler.postDelayed(()->poll(),1000);}
   else {fail("O Core não respondeu. Abra o Diagnóstico para conferir a etapa.");releaseCore();}
  });
 },"core-health").start();}
 public final class ExportBridge{
  @JavascriptInterface public void saveCrystal(String contents,String filename){
   if(contents==null||contents.length()>24000000)return;
   runOnUiThread(()->{
    if(pendingExport!=null){Toast.makeText(MainActivity.this,"Conclua o salvamento anterior.",Toast.LENGTH_LONG).show();return;}
    if(!beginFileTransfer())return;
    try{pendingExport=contents.getBytes("UTF-8");Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/octet-stream");i.putExtra(Intent.EXTRA_TITLE,filename!=null&&filename.matches("[A-Za-z0-9._-]+")?filename:"companion.companion");startActivityForResult(i,SAVE);}
    catch(Exception e){endFileTransfer();pendingExport=null;show("Não foi possível salvar. Use Baixar novamente no painel do Cristal.");}
   });
  }
 }
 @Override protected void onActivityResult(int req,int result,Intent data){super.onActivityResult(req,result,data);
  if(req==OPEN||req==SAVE)endFileTransfer();
  if(req==OPEN&&chooser!=null){chooser.onReceiveValue(result==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);chooser=null;}
  if(req==SAVE){byte[] bytes=pendingExport;pendingExport=null;if(result==RESULT_OK&&data!=null&&bytes!=null){Uri target=data.getData();new Thread(()->{try(OutputStream out=getContentResolver().openOutputStream(target,"wt")){if(out==null)throw new IOException();out.write(bytes);out.flush();runOnUiThread(()->show("Cristal salvo. Guarde a senha e o código de recuperação separadamente."));}catch(Exception e){runOnUiThread(()->show("O arquivo não foi salvo. Use Baixar novamente; não desinstale o aplicativo."));}},"crystal-save").start();}else show("Salvamento cancelado. O recolhimento pode já ter ocorrido: use Baixar novamente ou Cancele o recolhimento no painel.");}
 }
 private void show(String msg){new AlertDialog.Builder(this).setTitle("Companion Core").setMessage(msg).setPositiveButton("OK",null).show();}
 private void settings(){
  LinearLayout fields=new LinearLayout(this);fields.setOrientation(1);fields.setPadding(dp(20),0,dp(20),0);
  TextView intro=new TextView(this);intro.setText("O modelo não vem no APK. Informe seu gateway Ollama HTTPS. Não use localhost do PC nem chave da OpenAI.");fields.addView(intro);
  EditText url=new EditText(this);url.setHint("https://seu-servidor-ollama");url.setInputType(17);fields.addView(url);
  EditText model=new EditText(this);model.setHint("Modelo, ex.: gemma3:4b");fields.addView(model);
  EditText auth=new EditText(this);auth.setHint("Token do gateway (opcional)");auth.setInputType(129);fields.addView(auth);
  File file=new File(getFilesDir(),"gateway.json");
  try{byte[] raw=readSmall(file);JSONObject o=new JSONObject(new String(raw,"UTF-8"));url.setText(o.optString("baseUrl"));model.setText(o.optString("model","gemma3:4b"));auth.setText(o.optString("token"));}catch(Exception ignored){model.setText("gemma3:4b");}
  AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Servidor de conversa").setView(fields).setNegativeButton("Cancelar",null).setPositiveButton("Salvar",null).create();
  dialog.setOnShowListener(v->dialog.getButton(-1).setOnClickListener(w->{try{
   String address=url.getText().toString().trim();URI u=new URI(address);
   if(!"https".equals(u.getScheme())||u.getHost()==null||u.getUserInfo()!=null||u.getQuery()!=null||u.getFragment()!=null)throw new Exception();
   JSONObject o=new JSONObject();o.put("baseUrl",address);o.put("model",model.getText().toString().trim());o.put("token",auth.getText().toString().trim());
   File temp=new File(getFilesDir(),"gateway.tmp");try(FileOutputStream out=new FileOutputStream(temp)){out.write(o.toString().getBytes("UTF-8"));out.getFD().sync();}android.system.Os.rename(temp.toString(),file.toString());dialog.dismiss();show("Configuração salva. A conexão será usada na próxima conversa.");
  }catch(Exception e){url.setError("Informe uma URL HTTPS válida; não coloque credenciais no endereço.");}}));dialog.show();
 }
 private static byte[] readSmall(File f)throws IOException{try(InputStream in=new FileInputStream(f);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[1024];int n;while((n=in.read(b))!=-1){if(out.size()+n>16384)throw new IOException();out.write(b,0,n);}return out.toByteArray();}}
 @Override protected void onPause(){if(web!=null)web.onPause();super.onPause();}
 @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override protected void onDestroy(){releaseCore();stopService(new Intent(this,CoreService.class));handler.removeCallbacksAndMessages(null);if(chooser!=null)chooser.onReceiveValue(null);if(web!=null){web.removeJavascriptInterface("CompanionAndroid");web.destroy();}super.onDestroy();}
}
