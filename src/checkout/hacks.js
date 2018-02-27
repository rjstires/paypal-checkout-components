/* @flow */

import { info, warn, flush as flushLogs } from 'beaver-logger/client';
import { CONSTANTS } from 'xcomponent/src';
import { getParent, getTop } from 'cross-domain-utils/src';

import { config } from '../config';
import { noop, isIE, getDomainSetting, extendUrl, patchMethod, once } from '../lib';

import { Checkout } from './component';

if (isIE() && getDomainSetting('ie_full_page')) {
    // $FlowFixMe
    Checkout.renderTo = (win) => {
        info('force_ie_full_page');
        flushLogs();

        let checkout = Checkout.init({
            onAuthorize: noop
        });

        checkout.delegate(win);

        checkout.openContainer().then(() => {
            checkout.event.triggerOnce(CONSTANTS.EVENTS.CLOSE);
            checkout.showContainer();
        });

        window.xprops.payment().then(token => {
            window.top.location = extendUrl(config.checkoutUrl, { token });
        }).catch(err => {
            checkout.error(err);
        });
    };
}

let parent = getParent(window);
let top = getTop(window);

if (top && parent) {
    let canRenderTop = (top === parent);

    if (!canRenderTop) {
        Checkout.canRenderTo(top).then(result => {
            canRenderTop = result;
        });

        patchMethod(Checkout, 'renderTo', ({ args: [ win, props, el ], original, context }) => {

            if (!canRenderTop) {
                win = getParent(window);
            }

            return original.call(context, win, props, el);
        });
    }
}

if (getDomainSetting('allow_full_page_fallback')) {
    patchMethod(Checkout, 'renderTo', ({ callOriginal, args: [ , props ] }) => {
        let handleError = once((err) => {
            try {
                // eslint-disable-next-line no-console
                console.error(err && err.stack);
            } catch (err2) { // eslint-disable-line unicorn/catch-error-name
                // pass
            }
            return window.xprops.payment().then(token => {
                window.top.location = extendUrl(config.checkoutUrl, { token });
            });
        });

        props.onError = handleError;
        return callOriginal().catch(handleError);
    });
}

let debounce = false;

patchMethod(Checkout, 'renderTo', ({ callOriginal, args: [ , props ] }) => {

    if (debounce) {
        warn('button_mutliple_click_debounce');
        return;
    }

    debounce = true;

    for (let methodName of [ 'onAuthorize', 'onCancel', 'onError', 'onClose' ]) {
        let original = props[methodName];
        props[methodName] = function unDebounce() : mixed {
            debounce = false;
            if (original) {
                return original.apply(this, arguments);
            }
        };
    }

    return callOriginal();
});

if (window.xprops && window.xprops.validate) {

    let enabled = true;

    window.xprops.validate({
        enable() {
            enabled = true;
        },

        disable() {
            enabled = false;
        }
    });

    patchMethod(Checkout, 'renderTo', ({ callOriginal }) => {
        if (enabled) {
            return callOriginal();
        }
    });
}
