#include <jni.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
extern int node_start(int argc, char **argv) __asm__("_ZN4node5StartEiPPc");
JNIEXPORT jint JNICALL Java_com_companioncore_mobile_MainActivity_startCore(JNIEnv *env,jclass cls,jstring root,jstring token){
 const char *dir=(*env)->GetStringUTFChars(env,root,0);
 const char *secret=(*env)->GetStringUTFChars(env,token,0);
 if(chdir(dir)!=0)return -1;
 setenv("COMPANION_APP_TOKEN",secret,1);
 (*env)->ReleaseStringUTFChars(env,root,dir);
 (*env)->ReleaseStringUTFChars(env,token,secret);
 char args[]="node\0bootstrap.mjs\0";
 char *argv[]={args,args+5,NULL};
 return node_start(2,argv);
}
