'use strict';
const portalDestination=new URL('./docs/',location.href);
portalDestination.search=location.search;
portalDestination.hash=location.hash;
document.getElementById('portalRedirect').href=portalDestination.href;
location.replace(portalDestination.href);
