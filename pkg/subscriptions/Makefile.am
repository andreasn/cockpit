subscriptions_MODULES = \
	pkg/subscriptions/subscriptions.js \
	pkg/subscriptions/subscriptions-client.js \
	$(NULL)

subscriptions_TESTS = \
	$(NULL)

# Typically only modify stuff above this line

subscriptionsdir = $(pkgdatadir)/subscriptions
nodist_subscriptions_DATA = \
	pkg/subscriptions/index.min.html.gz \
	pkg/subscriptions/subscriptions.min.css.gz \
	pkg/subscriptions/bundle.min.js.gz \
	$(NULL)
subscriptions_DATA = \
	pkg/subscriptions/manifest.json \
	$(NULL)

subscriptionsdebugdir = $(debugdir)$(subscriptionsdir)
subscriptionsdebug_DATA = \
	pkg/subscriptions/react.js \
	pkg/subscriptions/bundle.js \
	pkg/subscriptions/subscriptions.css \
	pkg/subscriptions/index.html \
	pkg/subscriptions/subscriptions-view.jsx \
	pkg/subscriptions/subscriptions-view.js \
	pkg/subscriptions/subscriptions-register.jsx \
	pkg/subscriptions/subscriptions-register.js \
	pkg/subscriptions/cockpit-components-dialog.js \
	pkg/subscriptions/cockpit-components-listing.js \
	pkg/subscriptions/cockpit-components-select.js \
	$(subscriptions_MODULES) \
	$(NULL)

# Ugliness to be solved by webpack in the future
pkg/subscriptions/react.min.js: pkg/subscriptions/react.js
	$(MIN_JS_RULE)

subscriptions_MIN = \
	$(subscriptions_MODULES:.js=.min.js) \
	pkg/subscriptions/subscriptions-view.min.js \
	pkg/subscriptions/subscriptions-register.min.js \
	$(NULL)

subscriptions_BUNDLE = \
	pkg/subscriptions/react.min.js \
	pkg/subscriptions/cockpit-components-dialog.js \
	pkg/subscriptions/cockpit-components-listing.min.js \
	pkg/subscriptions/cockpit-components-select.min.js \
	$(subscriptions_MIN) \
	$(NULL)

pkg/subscriptions/bundle.min.js: $(subscriptions_BUNDLE)
	$(AM_V_GEN) $(srcdir)/tools/missing $(srcdir)/tools/jsbundle $@ $^

TESTS += $(subscriptions_TESTS)

CLEANFILES += \
	pkg/subscriptions/subscriptions.min.css \
	pkg/subscriptions/index.min.html \
	pkg/subscriptions/bundle.min.js \
	$(subscriptions_MIN) \
	$(nodist_subscriptions_DATA) \
	pkg/subscriptions/react.min.js \
	pkg/subscriptions/cockpit-components-dialog.min.js \
	pkg/subscriptions/cockpit-components-dialog.js \
	pkg/subscriptions/cockpit-components-listing.min.js \
	pkg/subscriptions/cockpit-components-listing.js \
	pkg/subscriptions/cockpit-components-select.min.js \
	pkg/subscriptions/cockpit-components-select.js \
	$(NULL)

EXTRA_DIST += \
	pkg/subscriptions/react.js \
	pkg/subscriptions/react.min.js \
	pkg/subscriptions/cockpit-components-dialog.jsx \
	pkg/subscriptions/cockpit-components-dialog.min.js \
	pkg/subscriptions/cockpit-components-listing.jsx \
	pkg/subscriptions/cockpit-components-listing.min.js \
	pkg/subscriptions/cockpit-components-listing.js \
	pkg/subscriptions/cockpit-components-select.jsx \
	pkg/subscriptions/cockpit-components-select.min.js \
	pkg/subscriptions/cockpit-components-select.js \
	pkg/subscriptions/subscriptions.min.css \
	pkg/subscriptions/index.min.html \
	pkg/subscriptions/bundle.min.js \
	$(subscriptions_BOWER) \
	$(subscriptions_BUNDLE) \
	$(subscriptions_MODULES) \
	$(subscriptions_DATA) \
	$(subscriptionsdebug_DATA) \
	$(subscriptions_TESTS) \
	$(NULL)
