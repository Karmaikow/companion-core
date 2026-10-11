package com.companioncore.mobile;

import android.app.*;
import android.os.*;
import android.content.*;
import android.graphics.Color;
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
 private static boolean started=false;
 private static String token;
 private static volatile String failure;
 private static native int startCore(String root,String secret);
 private WebView web;
 private TextView status;
 private ValueCallback<Uri[]> chooser;
 private byte[] pendingExport;
 private boolean loaded=false;
 private final Handler handler=new Handler(Looper.getMainLooper());
 private int attempts=0;
 private static final int OPEN=41,SAVE=42;
 private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
 private Button button(String label,Runnable action){Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setOnClickListener(v->action.run());return b;}
 @Override public void onCreate(Bundle saved){
  super.onCreate(saved);
  LinearLayout root=new LinearLayout(this);root.setOrientation(1);root.setBackgroundColor(Color.rgb(8,13,34));root.setFitsSystemWindows(true);
  if(Build.VERSION.SDK_INT>=30)root.setOnApplyWindowInsetsListener((v,i)->{android.graphics.Insets b=i.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());v.setPadding(b.left,b.top,b.right,b.bottom);return i;});
  LinearLayout bar=new LinearLayout(this);
  bar.addView(button("Refúgio",()->{if(loaded)web.loadUrl(ORIGIN+"/");}),new LinearLayout.LayoutParams(0,dp(48),1));
  bar.addView(button("IA",()->settings()),new LinearLayout.LayoutParams(0,dp(48),1));
  bar.addView(button("Ajuda",()->new AlertDialog.Builder(this).setTitle("Companion Core · beta 0.4").setMessage("O Core roda dentro deste APK. Crie seu acesso local e importe o Cristal no Hub.\n\nO chat livre precisa de um servidor Ollama HTTPS configurado em IA. Nenhum modelo está incluído.\n\nTransferências precisam de internet. Não desinstale o app nem limpe seus dados sem exportar o Cristal.\n\nEsta versão não mantém atividades em segundo plano e ainda não unifica o login com a conta web.").setPositiveButton("Entendi",null).show()),new LinearLayout.LayoutParams(0,dp(48),1));
  root.addView(bar);
  status=new TextView(this);status.setTextColor(Color.WHITE);status.setPadding(dp(12),dp(8),dp(12),dp(8));status.setText("Preparando o Core no aplicativo…");root.addView(status);
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
    if(chooser!=null)chooser.onReceiveValue(null);chooser=cb;
    Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");
    try{startActivityForResult(i,OPEN);}catch(Exception e){chooser.onReceiveValue(null);chooser=null;}return true;
   }
  });
  ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient(){@Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest r){return allowed(r.getUrl())?null:blocked();}});
  root.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
  synchronized(MainActivity.class){if(!started){started=true;byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);token=android.util.Base64.encodeToString(bytes,android.util.Base64.NO_WRAP);new Thread(()->boot(),"companion-core").start();}}
  poll();
 }
 private static boolean allowed(Uri u){return "http".equals(u.getScheme())&&"127.0.0.1".equals(u.getHost())&&u.getPort()==4187&&u.getUserInfo()==null;}
 private static WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
 private void boot(){try{
  File dir=new File(getFilesDir(),"core");dir.mkdirs();copyAssets("core",dir);
  System.loadLibrary("c++_shared");System.loadLibrary("node");System.loadLibrary("companion");
  int result=startCore(dir.getAbsolutePath(),token);failure="O Core encerrou ("+result+"). Feche e abra o aplicativo.";
 }catch(Throwable e){failure="Não foi possível iniciar o Core: "+e.getClass().getSimpleName()+". Esta beta exige Android 8+ ARM64.";}}
 private void copyAssets(String from,File to)throws IOException{
  String[] children=getAssets().list(from);
  if(children!=null&&children.length>0){to.mkdirs();for(String child:children)copyAssets(from+"/"+child,new File(to,child));}
  else{try(InputStream in=getAssets().open(from);OutputStream out=new FileOutputStream(to)){byte[] b=new byte[16384];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}}
 }
 private void poll(){new Thread(()->{
  boolean ready=false;HttpURLConnection c=null;
  try{c=(HttpURLConnection)new URL(ORIGIN+"/api/health").openConnection();c.setConnectTimeout(1000);c.setReadTimeout(1000);c.setRequestProperty("X-Companion-App",token);ready=c.getResponseCode()==200;}catch(Exception ignored){}finally{if(c!=null)c.disconnect();}
  final boolean ok=ready;runOnUiThread(()->{
   if(isDestroyed()||isFinishing())return;
   if(ok){android.webkit.CookieManager.getInstance().setCookie(ORIGIN,"companion_app="+token+"; Path=/; HttpOnly; SameSite=Strict",v->{android.webkit.CookieManager.getInstance().flush();loaded=true;status.setText("Core no APK · chat livre: configure Ollama em IA");web.loadUrl(ORIGIN+"/");});}
   else if(failure!=null)status.setText(failure);
   else if(++attempts<90)handler.postDelayed(()->poll(),1000);
   else status.setText("O Core não iniciou. Feche e abra o aplicativo. Não limpe os dados.");
  });
 },"core-health").start();}
 public final class ExportBridge{
  @JavascriptInterface public void saveCrystal(String contents,String filename){
   if(contents==null||contents.length()>24000000)return;
   runOnUiThread(()->{
    if(pendingExport!=null){Toast.makeText(MainActivity.this,"Conclua o salvamento anterior.",Toast.LENGTH_LONG).show();return;}
    try{pendingExport=contents.getBytes("UTF-8");Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/octet-stream");i.putExtra(Intent.EXTRA_TITLE,filename!=null&&filename.matches("[A-Za-z0-9._-]+")?filename:"companion.companion");startActivityForResult(i,SAVE);}
    catch(Exception e){pendingExport=null;show("Não foi possível salvar. Use Baixar novamente no painel do Cristal.");}
   });
  }
 }
 @Override protected void onActivityResult(int req,int result,Intent data){super.onActivityResult(req,result,data);
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
 @Override protected void onDestroy(){handler.removeCallbacksAndMessages(null);if(chooser!=null)chooser.onReceiveValue(null);if(web!=null){web.removeJavascriptInterface("CompanionAndroid");web.destroy();}super.onDestroy();}
}
