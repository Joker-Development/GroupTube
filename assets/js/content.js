var debug = false;
var session_token;
var socket;

/**
 * Debug Mode
 */
if(debug){
    socket = io('http://localhost:3000');
}else{
    socket = io('https://socket.grouptube.de');
}

/**
 * If Socket has successfully connected, continue with code
 */
socket.on('connect', () => {
    /**
     * Hover Events
     */
    $(document).on('mouseover', '#grouptube-session-start', function (e) {
        var tooltip = $('#grouptube-tooltip');
        var offsetLeft = ($(this).position().left+($('.ytp-gradient-bottom').outerWidth() - $('.ytp-chrome-bottom').outerWidth())/2) + ($(this).outerWidth()/2) - (tooltip.outerWidth() / 2);
        tooltip.css('left', offsetLeft);
        tooltip.show();
    });

    $(document).on('mouseleave', '#grouptube-session-start', function () {
        $('#grouptube-tooltip').hide();
    });

    /**
     * Click Events
     */
    $(document).on('click', '#grouptube-session-start', function () {
        $('#grouptube-tooltip').hide();
        socket.emit('create_session', function (data) {
            if(data.success){
                session_token = data.token;
                var url = window.location.href;
                url = addParametertoURL(url, 'grouptube_token', data.token);
                url = removeParameterFromURL(url, 'list');
                url = removeParameterFromURL(url, 'index');
                navigator.clipboard.writeText(url).then(() => {
                    setVideoText("Video URL has been copied to Clipboard. Send it to your friends 🙂");
                }, () => {
                    prompt("Send this URL to your friends:", url);
                });

                $('#grouptube-session-start').attr('disabled', 'disabled');
                updateViewCounter(1);
                createPageOverlay();
                removeRecommendationWrapper();
                disableAfterLoad();

                /**
                 * On video play
                */
                var video = $('video');
                video.on('play', function (e) {
                    socket.emit('video_play_server', session_token, getVideoTime(), function (data) {
                        if(!data.success){
                            throwConsoleError(data.error);
                        }
                    });
                });

                /**
                 * On video pause
                 */
                video.on('pause', function (e) {
                    socket.emit('video_pause_server', session_token, getVideoTime(), function (data) {
                        if(!data.success){
                            throwConsoleError(data.error);
                        }
                    });
                });

                video.on('seeked', function() {
                    socket.emit('video_set_time_server', session_token, getVideoTime(), function (data) {
                        if(!data.success){
                            throwConsoleError(data.error);
                        }
                    });
                });

                socket.on('get_video_properties',function(callback){
                    var data = {
                        'isPlaying': isVideoPlaying(),
                        'time': getVideoTime()
                    };
                    callback(data);
                });

                socket.on('update_session',function(data){
                    if(isVariableFromType(data.viewer_count, 'number')){
                        updateViewCounter(data.viewer_count);
                    }else{
                        throwConsoleError("Invalid Data!");
                    }
                });

                socket.on('disconnect',function(data){
                    setPlayVideo(false);
                    showVideoOverlayWithText('Connection to GroupTube Server lost!<br><span style="font-size: 15px;">This may be due to connection issues or the server getting updated.</span>');
                });

                createViewCounter();
            }else{
                throwConsoleError(data.error);
            }
        });
    });

    if(getUrlParameter('grouptube_token')){
        var token = getUrlParameter('grouptube_token');

        /**
         * Join room with token
         */
        socket.emit('join_room_by_token', token, function(data) {
            if (data.success) {
                setPlayVideo(false);
                setVideoTime(0);
                disableControls();
                createViewCounter();
                createPageOverlay();
                removeRecommendationWrapper();
                disableAfterLoad();

                /**
                 * Toggle video play
                 */
                socket.on('video_toggle_play',function(status, time){
                    setPlayVideo(status);
                    setVideoTime(time);
                });

                /**
                 * Set the current time of the video
                 */
                socket.on('video_set_time_client',function(time){
                    setVideoTime(time);
                });

                socket.on('set_video_properties',function(data){
                    setVideoTime(data.time);
                    setPlayVideo(data.isPlaying);
                });

                socket.on('update_session',function(data){
                    if(isVariableFromType(data.viewer_count, 'number')){
                        updateViewCounter(data.viewer_count);
                    }else{
                        throwConsoleError("Invalid Data!");
                    }
                });

                socket.on('video_close_session',function(){
                    setPlayVideo(false);
                    var url = window.location.href;
                    url = removeParameterFromURL(url, 'grouptube_token');
                    url = removeParameterFromURL(url, 't');
                    url = addParametertoURL(url, 't', ((Math.round(getVideoTime()) - 1) >= 0 ? (Math.round(getVideoTime()) - 1): 0));
                    showVideoOverlayWithText("GroupTube Session Owner closed the video!", url);
                    updateViewCounter("");
                });

                socket.on('disconnect',function(data){
                    updateViewCounter("");
                    setPlayVideo(false);
                    showVideoOverlayWithText('Connection to GroupTube Server lost!<br><span style="font-size: 15px;">This may be due to connection issues or the server getting updated.</span>');
                });

                /**
                 * Disable all keyboard keys
                 */
                $('body').on('keydown', function (e) {
                    return false;
                })
            }else{
                throwConsoleError(data.error);
            }
        });
    }else{
        if(!isLiveStream() && $('#grouptube-session-start').length === 0){
            $('.ytp-right-controls').prepend(getButtonHtml());
            $('#movie_player').append(getTooltipHtml());
        }
    }
});
updateViewCounter("");

function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

function getButtonHtml(){
    return `
    <button id="grouptube-session-start" class="ytp-subtitles-button ytp-button" aria-label="Start a GroupTube Session" style="text-align: center;" aria-pressed="false" title="Start a GroupTube Session">
        <svg aria-hidden="true" height="100%" width="60%" focusable="false" data-prefix="fas" data-icon="users" class="svg-inline--fa fa-users fa-w-20" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512">
            <path fill="currentColor" d="M96 224c35.3 0 64-28.7 64-64s-28.7-64-64-64-64 28.7-64 64 28.7 64 64 64zm448 0c35.3 0 64-28.7 64-64s-28.7-64-64-64-64 28.7-64 64 28.7 64 64 64zm32 32h-64c-17.6 0-33.5 7.1-45.1 18.6 40.3 22.1 68.9 62 75.1 109.4h66c17.7 0 32-14.3 32-32v-32c0-35.3-28.7-64-64-64zm-256 0c61.9 0 112-50.1 112-112S381.9 32 320 32 208 82.1 208 144s50.1 112 112 112zm76.8 32h-8.3c-20.8 10-43.9 16-68.5 16s-47.6-6-68.5-16h-8.3C179.6 288 128 339.6 128 403.2V432c0 26.5 21.5 48 48 48h288c26.5 0 48-21.5 48-48v-28.8c0-63.6-51.6-115.2-115.2-115.2zm-223.7-13.4C161.5 263.1 145.6 256 128 256H64c-35.3 0-64 28.7-64 64v32c0 17.7 14.3 32 32 32h65.9c6.3-47.4 34.9-87.3 75.2-109.4z"></path>
        </svg>
    </button>
    `;
}

function getTooltipHtml(){
    return `
    <div id="grouptube-tooltip" style="display:none; position: absolute; max-width: 300px; top: 645px; left: 969px; z-index: 1002; background-color: rgba(28,28,28,0.9); border-radius: 2px; padding: 5px 9px;font-size: 118%; font-weight: 500; line-height: 15px;">
        Create GroupTube Session
    </div>
    `;
}

function setPlayVideo(status){
    if(status){
        $('video')[0].play();
    }else{
        $('video')[0].pause();
    }
}

function isVideoPlaying() {
    return !$('video')[0].paused;
}

function setVideoTime(time){
    $('video')[0].currentTime = time;
}

function getVideoTime() {
    return $('video')[0].currentTime;
}

function disableControls() {
    $('.ytp-play-button.ytp-button, .ytp-next-button.ytp-button, .ytp-miniplayer-button.ytp-button, .ytp-right-controls>[class=ytp-button]').attr('disabled', 'disabled').css('pointer-events', 'none').css('opacity', '0.2');
    $('#movie_player, video, .ytp-progress-bar-container').css('pointer-events', 'none');
    $('.ytp-chrome-controls').css('pointer-events', 'all');
    $('.ytp-left-controls').append(`
    <div class="ytp-time-display notranslate">
        <button style="display: block; text-transform: unset;" disabled="true" class="ytp-live-badge ytp-button">Video is controlled by GroupTube Session Owner</button>
    </div>
    `);
}

function setVideoText(text){
    var element = $(`
        <div class="ytp-time-display notranslate">
            <button style="display: block; text-transform: unset;" disabled="true" class="ytp-live-badge ytp-button">`+text+`</button>
        </div>
    `).appendTo('.ytp-left-controls');
    setTimeout(function () {
        element.fadeOut('slow', function () {
            element.remove();
        });
    }, 5000);
}

function createViewCounter() {
    $('.ytp-right-controls').prepend(`
        <div id="grouptube-viewcounter" class="ytp-subtitles-button ytp-button" style="opacity: 1;">
            <button style="display: block;text-transform: unset;opacity: 1;" disabled="true" class="ytp-button">
                <svg aria-hidden="true" height="100%" width="40%" focusable="false" data-prefix="fas" data-icon="eye" class="svg-inline--fa fa-eye fa-w-18" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" style="display: inline-block;color: #cc0000;"><path fill="currentColor" d="M572.52 241.4C518.29 135.59 410.93 64 288 64S57.68 135.64 3.48 241.41a32.35 32.35 0 0 0 0 29.19C57.71 376.41 165.07 448 288 448s230.32-71.64 284.52-177.41a32.35 32.35 0 0 0 0-29.19zM288 400a144 144 0 1 1 144-144 143.93 143.93 0 0 1-144 144zm0-240a95.31 95.31 0 0 0-25.31 3.79 47.85 47.85 0 0 1-66.9 66.9A95.78 95.78 0 1 0 288 160z"></path></svg><span style="display: inline-block;vertical-align: top;margin-left: 4px;font-size: 90%;padding-top: 1px;">1</span>
            </button>
        </div>
    `);
}

function showVideoOverlayWithText(text, url = ""){
    var linkElement = url ? '<a href="'+url+'" style="color: rgb(62, 166, 255);">Want to continue watching?</a>🍿' : "";
    $('#grouptube-video-overlay').remove();
    $('#player-container-outer').prepend(`
        <div id="grouptube-video-overlay" style="position: absolute; top: 0;left: 0;width: 100%;height: 100%;background-color: rgba(0, 0, 0, 0.8);z-index: 2000000;color: #fff;">
            <h1 style="position: absolute;top: 50%;left: 50%;transform: translate(-50%, -50%);text-align: center;">
                `+text+`
                <div>
                    `+linkElement+`
                </div>
            </h1>
        </div>
    `);
}

function createPageOverlay() {
    $('body').prepend('<div class="grouptube-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:100000;background-color:rgba(0,0,0,0.8)"></div>');
    $('#player-container').css('z-index','1000000');
}

function removeRecommendationWrapper(){
    $('.ytp-ce-element').remove();
}

function uncheck(toggle) {
    if (toggle.hasAttribute('checked')) {
        toggle.click();
    }
}

function disableAfterLoad() {
    var autoplayToggle = document.getElementById('toggle');
    if (autoplayToggle) {
        uncheck(autoplayToggle);
    } else {
        setTimeout(disableAfterLoad, 500);
    }
}

function updateViewCounter(count) {
    $('#grouptube-viewcounter span').text(count);
}

function isVariableFromType(variable, type) {
    return typeof variable == type;
}

function throwConsoleError(error){
    if(debug){
        console.error("[GroupTube] Error: " + error);
    }
}

function isLiveStream(){
    return $('.ytp-live').length !== 0;
}

function removeParameterFromURL(url, parameter){
    var url_old = new URL(url);
    var query_string = url_old.search;
    var search_params = new URLSearchParams(query_string);
    search_params.delete(parameter);
    url_old.search = search_params.toString();
    return url_old.toString();
}

function addParametertoURL(url, parameter, value){
    var url_old = new URL(url);
    var query_string = url_old.search;
    var search_params = new URLSearchParams(query_string);
    search_params.append(parameter, value);
    url_old.search = search_params.toString();
    return url_old.toString();
}