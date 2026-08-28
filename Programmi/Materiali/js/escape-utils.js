/**
 * Utilità per ridurre il rischio XSS e abusi: escape e sanitizzazione input.
 * Usare escapeHtml() per contenuto testuale, escapeAttr() per attributi (es. data-*, title).
 * sanitizeInput() per trim e limite lunghezza prima del salvataggio (difesa in profondità).
 */
(function(global) {
    function escapeHtml(s) {
        if (s == null || s === '') return '';
        var div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }
    function escapeAttr(s) {
        if (s == null || s === '') return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    /** Trim e limita lunghezza (evita input eccessivo / bypass maxlength). */
    function sanitizeInput(s, maxLen) {
        if (s == null) return '';
        var t = String(s).trim();
        if (maxLen == null || maxLen <= 0) return t;
        return t.length > maxLen ? t.slice(0, maxLen) : t;
    }
    global.escapeHtml = escapeHtml;
    global.escapeAttr = escapeAttr;
    global.sanitizeInput = sanitizeInput;
})(typeof window !== 'undefined' ? window : this);
