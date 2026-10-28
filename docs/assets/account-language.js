'use strict';
// Read language before the secure account callback removes URL parameters. Never read or store tokens.
window.EHE_ACCOUNT_LANG=new URLSearchParams(location.search).get('lang')==='zh'?'zh':'en';
