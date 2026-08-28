/**
 * Caselle OTP a 6 cifre.
 * Uso:
 *   const otp = bindOtpBoxes('#otpBoxes');
 *   otp.getValue()  // '123456'
 *   otp.clear(); otp.focus();
 */
function bindOtpBoxes(containerEl, opts = {}) {
    const root = typeof containerEl === 'string'
        ? document.querySelector(containerEl)
        : containerEl;
    if (!root) return null;

    const len = opts.length || 6;
    const onComplete = typeof opts.onComplete === 'function' ? opts.onComplete : null;

    root.classList.add('otp-boxes');
    root.innerHTML = '';
    const inputs = [];

    for (let i = 0; i < len; i++) {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.inputMode = 'numeric';
        inp.pattern = '[0-9]*';
        inp.maxLength = 1;
        inp.className = 'otp-digit';
        inp.autocomplete = i === 0 ? 'one-time-code' : 'off';
        inp.setAttribute('aria-label', `Cifra ${i + 1} del codice`);
        inp.dataset.otpIndex = String(i);
        root.appendChild(inp);
        inputs.push(inp);
    }

    function getValue() {
        return inputs.map((el) => el.value.replace(/\D/g, '')).join('').slice(0, len);
    }

    function clear() {
        inputs.forEach((el) => { el.value = ''; });
    }

    function focus(index = 0) {
        const el = inputs[Math.max(0, Math.min(len - 1, index))];
        if (el) {
            el.focus();
            el.select();
        }
    }

    function fillFromString(raw) {
        const digits = String(raw || '').replace(/\D/g, '').slice(0, len);
        clear();
        for (let i = 0; i < digits.length; i++) inputs[i].value = digits[i];
        if (digits.length >= len) {
            focus(len - 1);
            if (onComplete) onComplete(getValue());
        } else if (digits.length > 0) {
            focus(digits.length);
        } else {
            focus(0);
        }
    }

    inputs.forEach((inp, i) => {
        inp.addEventListener('input', (e) => {
            const digits = String(e.target.value || '').replace(/\D/g, '');
            if (!digits) {
                e.target.value = '';
                return;
            }
            if (digits.length > 1) {
                fillFromString(digits);
                return;
            }
            e.target.value = digits[0];
            if (i < len - 1) focus(i + 1);
            else if (getValue().length === len && onComplete) onComplete(getValue());
        });

        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace') {
                if (inp.value) {
                    inp.value = '';
                    e.preventDefault();
                    return;
                }
                if (i > 0) {
                    e.preventDefault();
                    inputs[i - 1].value = '';
                    focus(i - 1);
                }
                return;
            }
            if (e.key === 'ArrowLeft' && i > 0) {
                e.preventDefault();
                focus(i - 1);
                return;
            }
            if (e.key === 'ArrowRight' && i < len - 1) {
                e.preventDefault();
                focus(i + 1);
                return;
            }
            if (e.key.length === 1 && !/\d/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
            }
        });

        inp.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text') || '';
            fillFromString(text);
        });

        inp.addEventListener('focus', () => inp.select());
    });

    return { getValue, clear, focus, fillFromString, inputs };
}
