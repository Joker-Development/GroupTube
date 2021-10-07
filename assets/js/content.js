var dev_mode = false;
var session_token;
var host;
var socket;

/**
 * Dev Mode
 */
if(dev_mode){
    socket = io('http://localhost:3000');
}else{
    socket = io('https://socket.grouptube.de');
}

/**
 * Variables
 */
var user_display_name = 'Guest';
var viewer_list = [];

/**
 * If Socket has successfully connected, continue with code
 */
socket.on('connect', () => {
    /**
     * Hover & Click Events
     */
    $(document).on('mouseover', '#grouptube-session-start', function (e) {
        var tooltip = $('#grouptube-tooltip');
        displayTooltip(tooltip, $(this));
    });

    $(document).on('mouseover', '#grouptube-nickname-btn', function (e) {
        var tooltip = $('#grouptube-nickname-tooltip');
        displayTooltip(tooltip, $(this));
    });

    $(document).on('mouseover', '#grouptube-invite-btn', function (e) {
        var tooltip = $('#grouptube-invite-tooltip');
        displayTooltip(tooltip, $(this));
    });

    $(document).on('mouseleave', '#grouptube-session-start', function () {
        $('#grouptube-tooltip').hide();
    });

    $(document).on('mouseleave', '#grouptube-nickname-btn', function () {
        $('#grouptube-nickname-tooltip').hide();
    });

    $(document).on('mouseleave', '#grouptube-invite-btn', function () {
        $('#grouptube-invite-tooltip').hide();
    });

    $(document).on('click', '.ytp-fullscreen-button', function () {
        var tooltip = $('#grouptube-tooltip, #grouptube-invite-tooltip');
        if(tooltip.css('bottom') === "50px"){
            tooltip.css('bottom', "72px");
            tooltip.css('padding-top', "8px");
            tooltip.css('padding-bottom', "8px");
        }else{
            tooltip.css('bottom', "50px");
            tooltip.css('padding-top', "5px");
            tooltip.css('padding-bottom', "5px");
        }
        $('.grouptube-viewer-list').hide();
    });

    $(document).on('click', '#grouptube-viewcounter', function () {
        var viewer_list_el = $('.grouptube-viewer-list');
        var leftPos = $(this).offset().left - viewer_list_el.css('width').replace(/[^-\d\.]/g, '')/2;
        var topPos = $(this).offset().top - viewer_list_el.css('height').replace(/[^-\d\.]/g, '') - 15;
        var bottomPos = window.innerHeight - $(this).offset().top + 15;
        viewer_list_el.css('left', leftPos + 'px');
        viewer_list_el.css('bottom', bottomPos + 'px');
        viewer_list_el.toggle();
    });

    $(document).on('click', '#grouptube-invite-btn', function () {
        getVideoInviteLink(session_token);
        $('#grouptube-invite-tooltip').hide();
        var invite_btn = $(this);
        invite_btn.attr('disabled', 'disabled');
        setTimeout(function (){
            invite_btn.removeAttr('disabled');
        }, 5000);
    });

    $(document).on('click', '#grouptube-session-leave', function () {
        leaveSession();
    });

    $(document).on('click', '#grouptube-nickname-btn', function () {
        renderNicknamePromt();
    });

    $(document).on('click', '#grouptube-nickname-promt-save', function () {
        var nickname = $('#grouptube-nickname-input').val();
        if(nickname){
            storageStore('grouptubeNickname', nickname, function () {
                user_display_name = nickname;
                $('#grouptube-nickname-promt').remove();
            });
        }else{
            addToast("Please enter a Username!");
        }
    });

    $(document).on('click', '#grouptube-debug-btn', function () {

    });

    /**
     * Click Event for starting a session
     */
    $(document).on('click', '#grouptube-session-start', function () {
        $('#grouptube-tooltip').hide();
        socket.emit('create_session', chrome.runtime, function (data) {
            if(data.success){
                /**
                 * Get token and build URL
                 */
                session_token = data.token;
                host = user_display_name;
                getVideoInviteLink(session_token);

                /**
                 * Build page
                 */
                $('#grouptube-session-start').attr('disabled', 'disabled');
                updateViewCounter(1);
                createPageOverlay();
                removeRecommendationWrapper();
                disableAfterLoad();
                addToViewerList(socket.id, user_display_name, true);

                /**
                 * On video play, send to server
                */
                var video = $('video');
                video.on('play', function (e) {
                    socket.emit('video_play_server', session_token, getVideoTime(), function (data) {
                        if(!data.success){
                            throwConsoleError(data);
                        }
                    });
                });

                /**
                 * On video pause, send to server
                 */
                video.on('pause', function (e) {
                    socket.emit('video_pause_server', session_token, getVideoTime(), function (data) {
                        if(!data.success){
                            throwConsoleError(data);
                        }
                    });
                });

                /**
                 * On video seeked, send to server
                 */
                video.on('seeked', function() {
                    socket.emit('video_set_time_server', session_token, getVideoTime(), function (data) {
                        if(!data.success){
                            throwConsoleError(data);
                        }
                    });
                });

                /**
                 * Get video playback information
                 */
                socket.on('get_video_properties',function(callback){
                    var data = {
                        'isPlaying': isVideoPlaying(),
                        'time': getVideoTime()
                    };
                    callback(data);
                });

                /**
                 * Update Session (View-count etc.)
                 */
                socket.on('update_session',function(data){
                    updateSession(data);
                });

                /**
                 * On disconnect display overlay
                 */
                socket.on('disconnect',function(data){
                    setPlayVideo(false);
                    showVideoOverlayWithText('Connection to GroupTube Server lost!<br><span style="font-size: 15px;">This may be due to connection issues or the server getting updated.</span>');
                });

                /**
                 * Build view-counter
                 */
                renderInviteButton();
                createViewCounter();
            }else{
                throwConsoleError(data);
            }
        });
    });


    createToastContainer();
    getNickname(function () {
        /**
         * If opened GroupTube video URL
         */
        if(getUrlParameter('grouptube_token')){
            var token = getUrlParameter('grouptube_token');
            $(document).ready(function(){
                /**
                 * Join room with token
                 */
                socket.emit('join_room_by_token', token, user_display_name, function(data) {
                    if (data.success) {
                        /**
                         * Build Page
                         */
                        viewer_list = data.viewer_list;
                        setHost();
                        setPlayVideo(false);
                        setVideoTime(0);
                        disableControls();
                        createViewCounter();
                        createPageOverlay();
                        removeRecommendationWrapper();
                        disableAfterLoad();

                        /**
                         * On Toggle video play
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

                        /**
                         * Set video playback information
                         * Only set video time if current video time is 0.5 ahead or behind host
                         */
                        socket.on('set_video_properties',function(data){
                            setPlayVideo(data.isPlaying);
                            var currentVideoTime = getVideoTime();
                            if((currentVideoTime > (data.time + 0.5)) || (currentVideoTime < (data.time - 0.5))){
                                setVideoTime(data.time);
                            }
                        });

                        /**
                         * Update session (View-count etc.)
                         */
                        socket.on('update_session',function(data){
                            updateSession(data);
                        });

                        /**
                         * On Master session close, display overlay and generate URL to continue watching alone
                         */
                        socket.on('video_close_session',function(){
                            setPlayVideo(false);
                            var url = window.location.href;
                            url = removeParameterFromURL(url, 'grouptube_token');
                            url = removeParameterFromURL(url, 't');
                            url = addParametertoURL(url, 't', ((Math.round(getVideoTime()) - 1) >= 0 ? (Math.round(getVideoTime()) - 1): 0));
                            showVideoOverlayWithText("GroupTube Session Owner closed the video!", url);
                            updateViewCounter("");
                        });

                        /**
                         * On server disconnect, update view-count, pause video and show overlay
                         */
                        socket.on('disconnect',function(data){
                            updateViewCounter("");
                            setPlayVideo(false);
                            showVideoOverlayWithText('Connection to GroupTube Server lost!<br><span style="font-size: 15px;">This may be due to connection issues or the server getting updated.</span>');
                        });

                        /**
                         * Disable all keyboard keys
                         */
                        $('body').on('keydown', function (e) {
                            if(e.target.id !== 'grouptube-nickname-input') return false;
                        });

                        /**
                         * Disable focus on movie_player element
                         */
                        $('*').on('focusin', function(e){
                            $("#movie_player").blur();
                        });

                        /**
                         * On Focus Window, update current Video Information
                         */
                        $(window).focus(function() {
                            if (token) {
                                setTimeout(function (){
                                    socket.emit('update_current_video_status', token);
                                }, 100);
                            }
                        });
                    }else{
                        throwConsoleError(data);
                    }
                });
            });
        }else{
            $(document).ready(function(){
                /**
                 * Display create session button
                 */
                if(!isLiveStream() && $('#grouptube-session-start').length === 0){
                    $('.ytp-right-controls').prepend(getButtonHtml());
                    $('#movie_player').append(getTooltipHtml());
                }
            });
        }
    });


    /**
     * When dev_mode mode is on, render debug button
     */
    if(dev_mode){
        $(document).ready(function(){
            renderDebugButton();
        });
    }
});
updateViewCounter("");

/**
 * Get URL Parameter by name
 */
function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

/**
 * Get button html
 */
function getButtonHtml(){
    return `
    <button id="grouptube-session-start" class="ytp-subtitles-button ytp-button" aria-label="Start a GroupTube Session" style="text-align: center;" aria-pressed="false" title="Start a GroupTube Session">
        <svg aria-hidden="true" height="100%" width="60%" focusable="false" data-prefix="fas" data-icon="users" class="svg-inline--fa fa-users fa-w-20" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512">
            <path fill="currentColor" d="M96 224c35.3 0 64-28.7 64-64s-28.7-64-64-64-64 28.7-64 64 28.7 64 64 64zm448 0c35.3 0 64-28.7 64-64s-28.7-64-64-64-64 28.7-64 64 28.7 64 64 64zm32 32h-64c-17.6 0-33.5 7.1-45.1 18.6 40.3 22.1 68.9 62 75.1 109.4h66c17.7 0 32-14.3 32-32v-32c0-35.3-28.7-64-64-64zm-256 0c61.9 0 112-50.1 112-112S381.9 32 320 32 208 82.1 208 144s50.1 112 112 112zm76.8 32h-8.3c-20.8 10-43.9 16-68.5 16s-47.6-6-68.5-16h-8.3C179.6 288 128 339.6 128 403.2V432c0 26.5 21.5 48 48 48h288c26.5 0 48-21.5 48-48v-28.8c0-63.6-51.6-115.2-115.2-115.2zm-223.7-13.4C161.5 263.1 145.6 256 128 256H64c-35.3 0-64 28.7-64 64v32c0 17.7 14.3 32 32 32h65.9c6.3-47.4 34.9-87.3 75.2-109.4z"></path>
        </svg>
    </button>
    `;
}

/**
 * Get debug button html
 */
function getDebugButtonHtml(){
    return `
    <button id="grouptube-debug-btn" class="ytp-subtitles-button ytp-button" aria-label="Debug GroupTube" style="text-align: center;" aria-pressed="false" title="Debug GroupTube">
        <svg aria-hidden="true" height="100%" width="60%" focusable="false" data-prefix="fas" data-icon="bug" class="svg-inline--fa fa-bug fa-w-16" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
            <path fill="currentColor" d="M511.988 288.9c-.478 17.43-15.217 31.1-32.653 31.1H424v16c0 21.864-4.882 42.584-13.6 61.145l60.228 60.228c12.496 12.497 12.496 32.758 0 45.255-12.498 12.497-32.759 12.496-45.256 0l-54.736-54.736C345.886 467.965 314.351 480 280 480V236c0-6.627-5.373-12-12-12h-24c-6.627 0-12 5.373-12 12v244c-34.351 0-65.886-12.035-90.636-32.108l-54.736 54.736c-12.498 12.497-32.759 12.496-45.256 0-12.496-12.497-12.496-32.758 0-45.255l60.228-60.228C92.882 378.584 88 357.864 88 336v-16H32.666C15.23 320 .491 306.33.013 288.9-.484 270.816 14.028 256 32 256h56v-58.745l-46.628-46.628c-12.496-12.497-12.496-32.758 0-45.255 12.498-12.497 32.758-12.497 45.256 0L141.255 160h229.489l54.627-54.627c12.498-12.497 32.758-12.497 45.256 0 12.496 12.497 12.496 32.758 0 45.255L424 197.255V256h56c17.972 0 32.484 14.816 31.988 32.9zM257 0c-61.856 0-112 50.144-112 112h224C369 50.144 318.856 0 257 0z"></path>
        </svg>
    </button>
    `;
}

/**
 * Get nickname button html
 */
function getNicknameButtonHtml(){
    return `
    <button id="grouptube-nickname-btn" class="ytp-subtitles-button ytp-button" aria-label="Set GroupTube Nickname" style="text-align: center;" aria-pressed="false" title="Debug GroupTube">
        <svg aria-hidden="true" height="100%" width="60%" focusable="false" data-prefix="fas" data-icon="user-tag" class="svg-inline--fa fa-user-tag fa-w-20" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512">
            <path fill="currentColor" d="M630.6 364.9l-90.3-90.2c-12-12-28.3-18.7-45.3-18.7h-79.3c-17.7 0-32 14.3-32 32v79.2c0 17 6.7 33.2 18.7 45.2l90.3 90.2c12.5 12.5 32.8 12.5 45.3 0l92.5-92.5c12.6-12.5 12.6-32.7.1-45.2zm-182.8-21c-13.3 0-24-10.7-24-24s10.7-24 24-24 24 10.7 24 24c0 13.2-10.7 24-24 24zm-223.8-88c70.7 0 128-57.3 128-128C352 57.3 294.7 0 224 0S96 57.3 96 128c0 70.6 57.3 127.9 128 127.9zm127.8 111.2V294c-12.2-3.6-24.9-6.2-38.2-6.2h-16.7c-22.2 10.2-46.9 16-72.9 16s-50.6-5.8-72.9-16h-16.7C60.2 287.9 0 348.1 0 422.3v41.6c0 26.5 21.5 48 48 48h352c15.5 0 29.1-7.5 37.9-18.9l-58-58c-18.1-18.1-28.1-42.2-28.1-67.9z"></path>
        </svg>
    </button>
    `;
}

/**
 * Get debug button html
 */
function getInviteButtonHtml(){
    return `
    <button id="grouptube-invite-btn" class="ytp-subtitles-button ytp-button" aria-label="Copy invite link" style="text-align: center;" aria-pressed="false" title="Copy invite link">
        <svg aria-hidden="true" height="100%" width="50%" focusable="false" data-prefix="fas" data-icon="user-plus" class="svg-inline--fa fa-user-plus fa-w-20" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512">
            <path fill="currentColor" d="M624 208h-64v-64c0-8.8-7.2-16-16-16h-32c-8.8 0-16 7.2-16 16v64h-64c-8.8 0-16 7.2-16 16v32c0 8.8 7.2 16 16 16h64v64c0 8.8 7.2 16 16 16h32c8.8 0 16-7.2 16-16v-64h64c8.8 0 16-7.2 16-16v-32c0-8.8-7.2-16-16-16zm-400 48c70.7 0 128-57.3 128-128S294.7 0 224 0 96 57.3 96 128s57.3 128 128 128zm89.6 32h-16.7c-22.2 10.2-46.9 16-72.9 16s-50.6-5.8-72.9-16h-16.7C60.2 288 0 348.2 0 422.4V464c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48v-41.6c0-74.2-60.2-134.4-134.4-134.4z"></path>
        </svg>
    </button>
    `;
}

/**
 * Get leave session button html
 */
function getLeaveSessionButtonHtml() {
    return `
    <span id="grouptube-session-leave" title="Leave the GroupTube Session" style="position: fixed;z-index: 2000000;top: 8px;right: 0;color: white;width: 46px;padding: 0;margin: 0;cursor: pointer;">
        <svg height="100%" width="60%" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="times" class="svg-inline--fa fa-times fa-w-11" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 512">
            <path fill="currentColor" d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"></path>
        </svg>
    </span>
    `;
}

/**
 * Get tooltip html
 */
function getTooltipHtml(){
    return `
    <div id="grouptube-tooltip" style="display:none; position: absolute; max-width: 300px; bottom: 50px; left: 969px; z-index: 1002; background-color: rgba(28,28,28,0.9); border-radius: 2px; padding: 5px 9px;font-size: 118%; font-weight: 500; line-height: 15px;">
        Create GroupTube Session
    </div>
    `;
}

/**
 * Get nickname tooltip html
 */
function getNicknameTooltipHtml(){
    return `
    <div id="grouptube-nickname-tooltip" style="display:none; position: absolute; max-width: 300px; bottom: 50px; left: 969px; z-index: 1002; background-color: rgba(28,28,28,0.9); border-radius: 2px; padding: 5px 9px;font-size: 118%; font-weight: 500; line-height: 15px;">
        Set GroupTube Nickname
    </div>
    `;
}

/**
 * Get Checkmark html for toast
 */
function getToastCheckHtml() {
    return `
    <span style="width: 30px;color: green;">
        <svg height="100%" width="60%" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="check" class="svg-inline--fa fa-check fa-w-16" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
            <path fill="currentColor" d="M173.898 439.404l-166.4-166.4c-9.997-9.997-9.997-26.206 0-36.204l36.203-36.204c9.997-9.998 26.207-9.998 36.204 0L192 312.69 432.095 72.596c9.997-9.997 26.207-9.997 36.204 0l36.203 36.204c9.997 9.997 9.997 26.206 0 36.204l-294.4 294.401c-9.998 9.997-26.207 9.997-36.204-.001z"></path>
        </svg>
    </span>
    `;
}

/**
 * Get Times html for toast
 */
function getToastTimesHtml() {
    return `
    <span style="width: 25px;margin-bottom: -4px;color: red;">
        <svg height="100%" width="60%" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="times" class="svg-inline--fa fa-times fa-w-11" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 512">
            <path fill="currentColor" d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"></path>
        </svg>
    </span>
    `;
}

/**
 * Play/pause video
 */
function setPlayVideo(status){
    if(status){
        $('video')[0].play();
    }else{
        $('video')[0].pause();
    }
}

/**
 * Check if video is currently playing
 */
function isVideoPlaying() {
    return !$('video')[0].paused;
}

/**
 * Set current video playtime
 */
function setVideoTime(time){
    var video = $('video');
    if(time <= (video[0].duration - 0.25)){
        video[0].currentTime = time;
    }
}

/**
 * Get current video playtime
 */
function getVideoTime() {
    return $('video')[0].currentTime;
}

/**
 * Disable video controls for client
 */
function disableControls() {
    $('.ytp-play-button.ytp-button, .ytp-next-button.ytp-button, .ytp-miniplayer-button.ytp-button, .ytp-right-controls>[class=ytp-button]').attr('disabled', 'disabled').css('pointer-events', 'none').css('opacity', '0.2');
    $('#movie_player, video, .ytp-progress-bar-container').css('pointer-events', 'none');
    $('.ytp-chrome-controls').css('pointer-events', 'all');
    if(host){
        $('.ytp-left-controls').append(`
            <div class="ytp-time-display notranslate">
                <button style="display: block; text-transform: unset;" disabled="true" class="ytp-live-badge ytp-button">Video is controlled by `+host+`</button>
            </div>
        `);
    }else{
        $('.ytp-left-controls').append(`
            <div class="ytp-time-display notranslate">
                <button style="display: block; text-transform: unset;" disabled="true" class="ytp-live-badge ytp-button">Video is controlled by GroupTube Session Owner</button>
            </div>
        `);
    }
}

/**
 * Set video text in control bar
 */
function setVideoText(text){
    var video_text = $('#grouptube-video-text');
    if(video_text){
        video_text.remove();
    }
    var element = $(`
        <div id="grouptube-video-text" class="ytp-time-display notranslate">
            <button style="display: block; text-transform: unset;" disabled="true" class="ytp-live-badge ytp-button">`+text+`</button>
        </div>
    `).appendTo('.ytp-left-controls');
    setTimeout(function () {
        element.fadeOut('slow', function () {
            element.remove();
        });
    }, 5000);
}

/**
 * Create view counter
 */
function createViewCounter() {
    $('.ytp-right-controls').prepend(`
        <div id="grouptube-viewcounter" class="ytp-subtitles-button ytp-button" style="opacity: 1;cursor: pointer;">
            <button style="display: block;text-transform: unset;opacity: 1;cursor: pointer;" disabled="true" class="ytp-button">
                <svg aria-hidden="true" height="100%" width="40%" focusable="false" data-prefix="fas" data-icon="eye" class="svg-inline--fa fa-eye fa-w-18" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" style="display: inline-block;color: #cc0000;pointer-events: all;cursor: pointer;"><path fill="currentColor" d="M572.52 241.4C518.29 135.59 410.93 64 288 64S57.68 135.64 3.48 241.41a32.35 32.35 0 0 0 0 29.19C57.71 376.41 165.07 448 288 448s230.32-71.64 284.52-177.41a32.35 32.35 0 0 0 0-29.19zM288 400a144 144 0 1 1 144-144 143.93 143.93 0 0 1-144 144zm0-240a95.31 95.31 0 0 0-25.31 3.79 47.85 47.85 0 0 1-66.9 66.9A95.78 95.78 0 1 0 288 160z"></path></svg><span style="display: inline-block;vertical-align: top;margin-left: 4px;font-size: 90%;padding-top: 1px;">1</span>
            </button>
        </div>
    `);
}

/**
 * Display video overlay with given text
 */
function showVideoOverlayWithText(text, url = "", urlText = "Want to continue watching?"){
    if(isFullscreen()){
        $('.ytp-fullscreen-button').click();
    }
    var linkElement = url ? '<a href="'+url+'" style="color: rgb(62, 166, 255);">'+urlText+'</a>🍿' : "";
    var html = `
        <div id="grouptube-video-overlay" style="position: absolute; top: 0;left: 0;width: 100%;height: 100%;background-color: rgba(0, 0, 0, 0.8);z-index: 2000000;color: #fff;">
            <h1 style="position: absolute;top: 50%;left: 50%;transform: translate(-50%, -50%);text-align: center;">
                `+text+`
                <div>
                    `+linkElement+`
                </div>
            </h1>
        </div>
    `;
    $('#grouptube-video-overlay').remove();
    if(isTheaterMode()){
        $('#player-theater-container').prepend(html);
    }else{
        $('#player-container-outer').prepend(html);
    }
}

/**
 * Create page overlay
 */
function createPageOverlay() {
    if(isFullscreen()){
        $('.ytp-fullscreen-button').click();
    }
    var leaveSessionBtnHtml = getLeaveSessionButtonHtml();
    $('body').prepend(leaveSessionBtnHtml+'<div class="grouptube-viewer-list" style="display:none;position: absolute;z-index: 1000001;background: rgba(0, 0, 0, 0.44);border-radius: 5px;width: auto;min-width: 100px;font-size: 12px;color: white;padding: 5px 10px;left: 440px;"><span>Viewers:</span><ul style="list-style: none;margin-top: 2px;"></ul></div><div class="grouptube-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:100000;background-color:rgba(0,0,0,0.8)"></div>');
    $('#player-container').css('z-index','1000000');
    setInterval(function (){
        if($('#player-container').css('z-index') !== '1000000'){
            $('#player-container').css('z-index','1000000');
        }
    }, 1000);
}

/**
 * Create Toast Container
 */
function createToastContainer(){
    $(document).ready(function(){
        $('body').prepend('<div id="grouptube-toast-container" style="position: fixed;left: 0;bottom: 0;z-index: 10000000000;font-size: 13px;"></div>')
    });
}

/**
 * Add Toast to container
 */
function addToast(message, timeToLive){
    if(!timeToLive){
        timeToLive = 2000;
    }
    var html = '<div style="align-items: center;background: #2d2e31;border-radius: 4px;bottom: 0;box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.28);box-sizing: border-box;display: flex;margin: 24px;max-width: 568px;min-height: 52px;min-width: 288px;padding: 0 24px;color: white;" class="grouptube-toast">'+message+'</div>';
    var toast = $(html).prependTo('#grouptube-toast-container');
    setTimeout(function () {
        toast.fadeOut(650, function(){
            toast.remove();
        });
    }, timeToLive);
}

/**
 * Update Session Data
 */
function updateSession(data) {
    if(!isVariableFromType(data, 'undefined')){
        if(isVariableFromType(data.viewer_count, 'number')){
            updateViewCounter(data.viewer_count);
        }else{
            updateViewCounter((parseInt($('#grouptube-viewcounter span').text()) - 1));
        }

        /**
         * Handle Viewer List
         */
        if(!isVariableFromType(data.viewer_data, 'undefined')){
            if(data.viewer_data.type === 'join'){
                if(isVariableFromType(data.viewer_data.display_name, 'string')){
                    addToViewerList(data.viewer_data.socket_id, data.viewer_data.display_name);
                }
            }else if(data.viewer_data.type === 'leave') {
                if(isVariableFromType(data.viewer_data.socket_id, 'string')){
                    removeFromViewerList(data.viewer_data.socket_id);
                }
            }
        }else{
            throwConsoleError({error: "Invalid Data!"});
        }
    }
}

/**
 * Add to viewer List
 */
function addToViewerList(id, name, isHost = false) {
    viewer_list.push({
        'name': name,
        'id': id,
        'isHost': isHost
    });
    socket.emit('update_viewer_list', session_token, viewer_list);
    if(id !== socket.id){
        addToast(getToastCheckHtml() + name + ' joined the session!');
    }
    updateViewerListHTML();
}

/**
 * Remove from viewer List
 */
function removeFromViewerList(id) {
    var name = '';
    viewer_list.forEach(function (value, key) {
        if(value.id === id){
            name = value.name;
            viewer_list.splice(key, 1);
        }
    });
    socket.emit('update_viewer_list', session_token, viewer_list);
    if(id !== socket.id){
        addToast(getToastTimesHtml() + name + ' left the session!');
    }
    updateViewerListHTML();
}

/**
 * Update viewer list html
 */
function updateViewerListHTML() {
    var viewer_list_el = $('.grouptube-viewer-list');

    viewer_list_el.find('ul').empty();
    viewer_list.forEach(function (value, key) {
        var name = value.name;
        if(value.isHost){
            name = value.name + ' <span style="background: red;border-radius: 2px;padding: 2px;font-size: 10px;">HOST</span>';
        }
        viewer_list_el.find('ul').append('<li style="margin-bottom: 2px;">' + name + '</li>');
    });
}

/**
 * Set Session Host
 */
function setHost() {
    viewer_list.forEach(function (value, key) {
        if(value.isHost){
            host = value.name;
        }
    });
}

/**
 * Remove video recommendations
 */
function removeRecommendationWrapper(){
    $('.ytp-ce-element').remove();
}

/**
 * Uncheck checkbox
 */
function uncheck(toggle) {
    if (toggle.hasAttribute('checked')) {
        toggle.click();
    }
}

/**
 * Disable autoplay
 */
function disableAfterLoad() {
    var autoplayToggle = document.getElementById('toggle');
    if (autoplayToggle) {
        uncheck(autoplayToggle);
    } else {
        setTimeout(disableAfterLoad, 500);
    }
}

/**
 * Update view counter
 */
function updateViewCounter(count) {
    $('#grouptube-viewcounter span').text(count);
}

/**
 * Check if given variable has a given type
 */
function isVariableFromType(variable, type) {
    return typeof variable == type;
}

/**
 * Display Error in web console
 */
function throwConsoleError(data){
    if(data.type === 'display'){
        if(data.url && data.url_text){
            showVideoOverlayWithText(data.error, data.url, data.url_text);
        }else{
            showVideoOverlayWithText(data.error);
        }
    }else{
        if(dev_mode){
            console.error("[GroupTube] Error: " + data.error);
        }
    }
}

/**
 * Check if current video is a live stream
 */
function isLiveStream(){
    return $('.ytp-live').length !== 0;
}

/**
 * Check if the user is in fullscreen mode
 */
function isFullscreen(){
    return !(typeof $('ytd-app').attr('masthead-hidden_') == "undefined");
}

/**
 * Check if the user is in theater mode
 */
function isTheaterMode(){
    return $('#player-theater-container').children().length > 0;
}

/**
 * Remove given parameter from given url
 */
function removeParameterFromURL(url, parameter){
    var url_old = new URL(url);
    var query_string = url_old.search;
    var search_params = new URLSearchParams(query_string);
    search_params.delete(parameter);
    url_old.search = search_params.toString();
    return url_old.toString();
}

/**
 * Add given parameter to given URL
 */
function addParametertoURL(url, parameter, value){
    var url_old = new URL(url);
    var query_string = url_old.search;
    var search_params = new URLSearchParams(query_string);
    search_params.append(parameter, value);
    url_old.search = search_params.toString();
    return url_old.toString();
}

/**
 * Retrieve Variables from page
 */
function retrieveWindowVariables(variables) {
    var ret = {};

    var scriptContent = "";
    for (var i = 0; i < variables.length; i++) {
        var currVariableOne = variables[i];
        scriptContent += "if (typeof " + currVariableOne + " !== 'undefined') document.body.setAttribute('tmp_" + currVariableOne + "', JSON.stringify(" + currVariableOne + "));\n"
    }

    var script = document.createElement('script');
    script.id = 'tmpScript';
    script.appendChild(document.createTextNode(scriptContent));
    (document.body || document.head || document.documentElement).appendChild(script);

    for (var i = 0; i < variables.length; i++) {
        var currVariableTwo = variables[i];
        var body = $("body");
        ret[currVariableTwo] = $.parseJSON(body.attr("tmp_" + currVariableTwo));
        body.removeAttr("tmp_" + currVariableTwo);
    }

    $("#tmpScript").remove();

    return ret;
}

/**
 * Build invite Link and copy to clipboard
 */
function getVideoInviteLink(token){
    var url = window.location.href;
    url = addParametertoURL(url, 'grouptube_token', token);
    url = removeParameterFromURL(url, 'list');
    url = removeParameterFromURL(url, 'index');
    url = removeParameterFromURL(url, 't');
    navigator.clipboard.writeText(url).then(() => {
        setVideoText("Video URL has been copied to Clipboard. Send it to your friends 🙂");
    }, () => {
        prompt("Send this URL to your friends:", url);
    });
}

/**
 * Calculate offset and display given Tooltip
 */
function displayTooltip(tooltip, element){
    var offsetLeft = (element.position().left+($('.ytp-gradient-bottom').outerWidth() - $('.ytp-chrome-bottom').outerWidth())/2) + (element.outerWidth()/2) - (tooltip.outerWidth() / 2);
    tooltip.css('left', offsetLeft);
    tooltip.show();
}

/**
 * Append Debug Button to Youtube controls
 */
function renderDebugButton() {
    $('.ytp-right-controls').prepend(getDebugButtonHtml());
}

/**
 * Append Debug Button to Youtube controls
 */
function renderNicknameButton() {
    $(document).ready(function(){
        $('.ytp-right-controls').prepend(getNicknameButtonHtml());
        $('#movie_player').append(getNicknameTooltipHtml());
    });
}

/**
 * Append Invite Button to Youtube controls
 */
function renderInviteButton() {
    $('.ytp-right-controls').prepend(getInviteButtonHtml());
    $('#movie_player').append(`
        <div id="grouptube-invite-tooltip" style="display:none; position: absolute; max-width: 300px; bottom: 50px; left: 969px; z-index: 1002; background-color: rgba(28,28,28,0.9); border-radius: 2px; padding: 5px 9px;font-size: 118%; font-weight: 500; line-height: 15px;">
            Copy Invite Link
        </div>
    `);
}

/**
 * Leave GroupTube Session
 */
function leaveSession() {
    var url = window.location.href;
    url = removeParameterFromURL(url, 'grouptube_token');
    url = removeParameterFromURL(url, 'list');
    url = removeParameterFromURL(url, 'index');
    url = removeParameterFromURL(url, 't');
    url = addParametertoURL(url, 't', ((Math.round(getVideoTime()) - 1) >= 0 ? (Math.round(getVideoTime()) - 1): 0));
    window.location.href = url;
}

function getNickname(callback) {
    var key = 'grouptubeNickname';
    storageRetrieve(key, function (data) {
        if(data[key] === undefined){
            renderNicknamePromt();
        }else{
            user_display_name = data[key];
        }
        renderNicknameButton();
        callback();
    });
}

function renderNicknamePromt(){
    $(document).ready(function() {
        $('body').prepend(`
            <div id="grouptube-nickname-promt" style="position: fixed;top: 0;left: 0;width: 100%;height: 100%;z-index: 1100000;background-color: rgba(0,0,0,0.8);">
                <div id="grouptube-nickname-promt-body" style="position: absolute;top: 50%;left: 50%;transform: translate(-50%, -50%);width: 25rem;height: 20rem;display: flex;flex-direction: column;align-items: center;justify-content: space-evenly;text-align: center;background: #2d2e31;border-radius: 4px;box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.28);padding: 0 24px;color: white;">
                    <h1>GroupTube Nickname</h1>
                    <input type="text" placeholder="Enter a Nickname.." id="grouptube-nickname-input" style="height: 25px;border-radius: 5px;border: none;outline: none;display: block;box-shadow: 0 0 10px 0 black;padding: 0 10px;"><small style="font-size: 11px;">Your Nickname is used to tell other People who joined their session.</small>
                    <button id="grouptube-nickname-promt-save" style="background-color: #cc0000;padding: 10px 16px;border-radius: 2px;border: none;color: white;font-weight: bold;text-transform: uppercase;font-family: 'Roboto', 'Noto', sans-serif;font-size: 13px;cursor: pointer;">Save</button>
                </div>
            </div>
        `);
    });
}

function storageStore(key, data, callback) {
    var obj = {};
    obj[key] = data
    chrome.storage.sync.set(obj, function () {
        callback();
    });
}

function storageRetrieve(key, callback) {
    chrome.storage.sync.get(key, function (data) {
        callback(data);
    });
}

function storageClear(callback){
    chrome.storage.sync.clear(function () {
        callback();
    });
}