(()=>{'use strict';
const paths={documents:'M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h5',templates:'M3 4h18v5H3zM3 13h7v8H3zM14 13h7v8h-7z',submissionForms:'M8 4h8v3H8zM7 5H4v16h16V5h-3M8 14l3 3 5-6',courseProgress:'m2 8 10-5 10 5-10 5zM6 10.5v6L12 20l6-3.5v-6M22 8v8',trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',guide:'M12 5C8 3 5 3 3 5v15c3-2 6-2 9 0 3-2 6-2 9 0V5c-3-2-6-2-9 0zM12 5v15',shield:'m12 3 8 4v6c0 4-4 7-8 9-4-2-8-5-8-9V7zM8 12l3 3 5-6'};
window.TeryaqBottomIcon=key=>'<svg class="ui-icon bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[key]||paths.documents)+'"/></svg>';
})();
