package com.companioncore.mobile;

import android.content.Context;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;

/** One pinned public model, downloaded only on request. Install only after SHA-256 validation. */
final class LocalModel {
 static final long SIZE=1117320736L;
 static final String SHA="6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e";
 static final String URL="https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9/qwen2.5-1.5b-instruct-q4_k_m.gguf";
 static volatile boolean busy=false,cancelled=false;
 static File model(Context c){return new File(c.getFilesDir(),"models/qwen-1.5b-q4.gguf");}
 static void cancel(){cancelled=true;}
 static void report(Context c,String value){try{File temp=new File(c.getFilesDir(),"local-model-status.tmp");try(FileOutputStream out=new FileOutputStream(temp)){out.write(value.getBytes("UTF-8"));}android.system.Os.rename(temp.toString(),new File(c.getFilesDir(),"local-model-status.txt").toString());}catch(Exception ignored){}}
 static synchronized void download(Context c){
  if(busy)return;
  if(model(c).length()==SIZE){report(c,"IA local instalada. Selecione IA no celular e toque em Salvar.");return;}
  busy=true;cancelled=false;
  new Thread(()->{
   File target=model(c);target.getParentFile().mkdirs();File part=new File(target.getParentFile(),"model.part");HttpURLConnection connection=null;
   try{
    if(c.getFilesDir().getUsableSpace()<SIZE+300000000L)throw new IOException("space");
    report(c,"Conectando para baixar 1,12 GB…");
    java.net.URL address=new java.net.URL(URL);
    for(int redirects=0;redirects<6;redirects++){
     if(!"https".equals(address.getProtocol()))throw new IOException("protocol");
     connection=(HttpURLConnection)address.openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(20000);connection.setReadTimeout(20000);
     int code=connection.getResponseCode();
     if(code==200)break;
     if(code!=301&&code!=302&&code!=303&&code!=307&&code!=308)throw new IOException("http");
     String location=connection.getHeaderField("Location");connection.disconnect();address=new java.net.URL(address,location);
     if(redirects==5)throw new IOException("redirects");
    }
    if(connection.getResponseCode()!=200)throw new IOException("http");
    MessageDigest digest=MessageDigest.getInstance("SHA-256");long total=0,last=0;
    try(InputStream in=connection.getInputStream();FileOutputStream out=new FileOutputStream(part)){
     byte[] buffer=new byte[65536];int n;
     while((n=in.read(buffer))!=-1){
      if(cancelled)throw new IOException("cancel");total+=n;if(total>SIZE)throw new IOException("size");out.write(buffer,0,n);digest.update(buffer,0,n);
      if(System.currentTimeMillis()-last>700){last=System.currentTimeMillis();report(c,"Baixando IA local: "+(100*total/SIZE)+"% · "+(total/1000000)+" / 1117 MB");}
     }
     out.getFD().sync();
    }
    StringBuilder hash=new StringBuilder();for(byte b:digest.digest())hash.append(String.format("%02x",b&255));
    if(cancelled||total!=SIZE||!SHA.equals(hash.toString()))throw new IOException("integrity");
    android.system.Os.rename(part.toString(),target.toString());report(c,"IA local instalada e verificada. Selecione IA no celular e toque em Salvar.");
   }catch(Exception e){part.delete();report(c,cancelled?"Download cancelado. Você pode iniciar novamente.":"Não foi possível instalar a IA. Confira internet e pelo menos 1,5 GB livres; toque em Baixar para tentar novamente.");}
   finally{if(connection!=null)connection.disconnect();busy=false;}
  },"companion-model-download").start();
 }
}
