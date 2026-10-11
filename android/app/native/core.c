#include <jni.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <stdio.h>
#include <errno.h>
extern int node_start(int argc, char **argv) __asm__("_ZN4node5StartEiPPc");
JNIEXPORT jint JNICALL Java_com_companioncore_mobile_MainActivity_startCore(JNIEnv *env,jclass cls,jstring root,jstring token){
 const char *dir=(*env)->GetStringUTFChars(env,root,0);
 const char *secret=(*env)->GetStringUTFChars(env,token,0);
 if(!dir||!secret)return -1;
 if(chdir(dir)!=0){
  (*env)->ReleaseStringUTFChars(env,root,dir);
  (*env)->ReleaseStringUTFChars(env,token,secret);
  return -1;
 }
 // Android's inherited stdio may be closed. Open it explicitly before Node starts.
 freopen("../core-startup.log","a",stdout);
 freopen("../core-startup.log","a",stderr);
 setvbuf(stdout,NULL,_IONBF,0);setvbuf(stderr,NULL,_IONBF,0);
 fprintf(stderr,"[native] Node entry reached; bootstrap readable=%d\n",access("bootstrap.cjs",R_OK)==0);
 setenv("COMPANION_APP_TOKEN",secret,1);
 (*env)->ReleaseStringUTFChars(env,root,dir);
 (*env)->ReleaseStringUTFChars(env,token,secret);
 // Node/libuv expects writable, contiguous argv storage with process lifetime.
 char *args=malloc(sizeof("node\0bootstrap.cjs\0"));
 if(!args){fprintf(stderr,"[native] argv allocation failed\n");return -1;}
 memcpy(args,"node\0bootstrap.cjs\0",sizeof("node\0bootstrap.cjs\0"));
 char *argv[]={args,args+5,NULL};
 int result=node_start(2,argv);
 fprintf(stderr,"[native] Node returned %d\n",result);
 free(args);
 return result;
}
