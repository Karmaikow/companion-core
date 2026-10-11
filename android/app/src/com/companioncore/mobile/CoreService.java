package com.companioncore.mobile;

import android.app.Service;
import android.content.Intent;
import android.os.*;
import java.io.*;

/** Bound, private process: a native exit must never terminate the Activity process. */
public final class CoreService extends Service {
 private boolean running=false;
 private FileOutputStream startupLog;
 private final Messenger binder=new Messenger(new Handler(Looper.getMainLooper()){
  @Override public void handleMessage(Message m){
   if(m.what!=1||running)return;
   final String token=m.getData().getString("token");
   if(token==null||token.length()<32)return;
   running=true;
   new Thread(()->boot(token),"companion-runtime").start();
  }
 });
 @Override public IBinder onBind(Intent intent){return binder.getBinder();}
 private void stage(String value){
  try(FileOutputStream out=new FileOutputStream(new File(getFilesDir(),"core-startup-stage.txt"))){out.write(value.getBytes("UTF-8"));out.getFD().sync();}catch(IOException ignored){}
 }
 private void boot(String token){try{
  stage("Preparando os arquivos do Core");
  File dir=new File(getFilesDir(),"core");dir.mkdirs();copyAssets("core",dir);
  // Retain the descriptors. Logs are private; the UI displays only a bounded diagnostic.
  startupLog=new FileOutputStream(new File(getFilesDir(),"core-startup.log"),false);
  android.system.Os.dup2(startupLog.getFD(),1);android.system.Os.dup2(startupLog.getFD(),2);
  stage("Carregando biblioteca C++");System.loadLibrary("c++_shared");
  stage("Carregando runtime Node Mobile");System.loadLibrary("node");
  stage("Carregando conexão nativa do Core");System.loadLibrary("companion");
  stage("Inicializando Node e servidor interno");
  int result=MainActivity.startCore(dir.getAbsolutePath(),token);
  stage("Core encerrado com código "+result);
 }catch(Throwable e){
  stage("Falha: "+e.getClass().getSimpleName());
  try(FileOutputStream out=new FileOutputStream(new File(getFilesDir(),"core-startup.log"),true)){
   String text=e.toString();out.write((text.substring(0,Math.min(2000,text.length()))+"\n").getBytes("UTF-8"));
  }catch(IOException ignored){}
 }}
 private void copyAssets(String from,File to)throws IOException{
  String[] children=getAssets().list(from);
  if(children!=null&&children.length>0){to.mkdirs();for(String child:children)copyAssets(from+"/"+child,new File(to,child));}
  else{try(InputStream in=getAssets().open(from);OutputStream out=new FileOutputStream(to)){byte[] b=new byte[16384];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}}
 }
 @Override public void onDestroy(){super.onDestroy();android.os.Process.killProcess(android.os.Process.myPid());}
}
