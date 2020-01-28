chrome.runtime.onInstalled.addListener(function() {
    chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
        chrome.declarativeContent.onPageChanged.addRules([{
            conditions: [
                new chrome.declarativeContent.PageStateMatcher({
                    pageUrl: {
                        urlContains: 'youtube.com/watch'
                    },
                })
            ],
            actions: [

            ]
        }]);
    });
});


chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        // if(request.setBadgeText && (typeof request.setBadgeText != "undefined")){
            var count = request.setBadgeText.toString();
            chrome.browserAction.setBadgeText({text: count});
        // }
    }
);