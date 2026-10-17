import {cloudAuth} from './cloud-vault.js';
import {cloudConfig} from './runtime-mode.js';
const requested=new URLSearchParams(location.search).get('return');
const target=['/asset-studio.html','/world-studio.html','/sprite-studio.html'].includes(requested)?requested:'/asset-studio.html';
document.querySelector('#back').href=target;
document.querySelector('#localLink').href=target+'?storage=local';
const status=document.querySelector('#loginStatus'),button=document.querySelector('#submit');
if(!cloudConfig?.url){button.disabled=true;status.textContent='Este ambiente não tem conta online configurada. Use a biblioteca neste navegador.';}
document.querySelector('#loginForm').onsubmit=async e=>{e.preventDefault();button.disabled=true;status.textContent='Entrando…';try{await cloudAuth.signIn(document.querySelector('#email').value,document.querySelector('#password').value);document.querySelector('#password').value='';try{sessionStorage.setItem('companion-studio.scope.v1','cloud');}catch{}location.assign(target);}catch(error){status.textContent=error.message;button.disabled=false;}};
