'use strict';
// Runs before the portal loads. Only fixed same-origin Auth callbacks are forwarded.
(()=>{const h=new URLSearchParams(location.hash.slice(1)),q=new URLSearchParams(location.search);if(!['recovery','signup','invite'].includes(h.get('type'))&&!q.has('token_hash'))return;const target=new URL('./account.html',location.href);target.search=location.search;target.hash=location.hash;history.replaceState(null,'',location.pathname);location.replace(target.href);})();
