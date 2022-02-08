var dev_mode = false;
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
var allow_markers = false
var debug_log = false
var session_token;
var host;
var is_host;
var markerColor = getRandomMarkerColor();

/**
 * If Socket has successfully connected, continue with code
 */
socket.on('connect', () => {
    /**
     * Hover & Click Events
     */

    // Tooltip
    $(document).on('mouseover', '.grouptube-button', function (e) {
        var tooltip = $('.grouptube-tooltip');
        tooltip.text($(this).attr('title'));
        displayTooltip(tooltip, $(this));
    });

    $(document).on('mouseleave', '.grouptube-button', function () {
        $('.grouptube-tooltip').hide();
    });

    $(document).on('click', '.grouptube-button', function () {
        $('.grouptube-tooltip').hide();
    });

    // YT Page Updates
    $(document).on('yt-page-data-updated', function () {
        if (isOnVideoPage()) {
            renderCreateSessionButton();
            renderTooltip();
        }
    });

    // Fullscreen Mode
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

    // Viewcounter
    $(document).on('click', '#grouptube-viewcounter', function () {
        var viewer_list_el = $('.grouptube-viewer-list');
        var leftPos = $(this).offset().left - viewer_list_el.css('width').replace(/[^-\d\.]/g, '')/2;
        // var topPos = $(this).offset().top - viewer_list_el.css('height').replace(/[^-\d\.]/g, '') - 15;
        var bottomPos = window.innerHeight - $(this).offset().top + 15;
        viewer_list_el.css('left', leftPos + 'px');
        viewer_list_el.css('bottom', bottomPos + 'px');
        viewer_list_el.toggle();
        debugLog('Toggle Viewer List...');
    });

    // Invite Link
    $(document).on('click', '#grouptube-invite-btn', function () {
        getVideoInviteLink(session_token);
        var invite_btn = $(this);
        invite_btn.attr('disabled', 'disabled');
        setTimeout(function (){
            invite_btn.removeAttr('disabled');
        }, 5000);
        debugLog('Copy Invite Link to Clipboard...');
    });

    // On Right click, disable context menu & set marker if allowed
    $(document).on('contextmenu', '#ytd-player', function(e) {
        if (allow_markers) {
            if (e.pageY < $('.ytp-chrome-bottom').offset().top) {
                var offset = $('video').offset();
                var videoWidth = $('video').outerWidth();
                var videoHeight = $('video').outerHeight();

                var videoPosX = e.pageX - offset.left;
                var videoPosY = e.pageY - offset.top;

                var posRelX = videoPosX / videoWidth;
                var posRelY = videoPosY / videoHeight;

                socket.emit('set_marker_server', session_token, user_display_name, posRelX, posRelY, markerColor, function (data) {
                    if(!data.success){
                        throwConsoleError(data);
                    }
                });
                debugLog('Tell Server to set marker...');
            }
        }
        return false;
    });

    // Disable right click on a marker
    $(document).on('contextmenu', '.grouptube-video-marker', function() {
        return false;
    });

    // Open Settings Menu
    $(document).on('click', '#grouptube-settings-button', function () {
        renderSettingsPromt();
    });

    // Save Settings
    $(document).on('click', '#grouptube-settings-save', function() {
        // Allow Markers
        var doAllowMarkers = $('#grouptube-allow-markers').prop('checked');
        if (is_host && allow_markers !== doAllowMarkers) {
            socket.emit('toggle_allow_markers_server', session_token, doAllowMarkers, function (data) {
                if(!data.success){
                    throwConsoleError(data);
                }
            });
        }

        // Debug Logging
        var debug_log_status =  $('#grouptube-debug-log').prop('checked');
        storageStore('grouptubeDebugLog', debug_log_status, function () {
            debug_log = debug_log_status;
        });

        // Close Settings Menu
        $('#grouptube-settings').remove();
        debugLog('Save GroupTube Settings...');
    });

    // Help Toast in Settings Menu
    $(document).on('click', '[data-help-text]', function () {
        var text = $(this).attr('data-help-text');
        addToast(getToastInfoHtml() + ' ' + text, 4000);
    });

    // Leave Session
    $(document).on('click', '#grouptube-session-leave', function () {
        leaveSession();
        debugLog('Leave Session...');
    });

    // Change Nickname
    $(document).on('click', '#grouptube-nickname-btn', function () {
        renderNicknamePromt();
    });

    // Save Nickname
    $(document).on('click', '#grouptube-nickname-promt-save', function () {
        var nickname = $('#grouptube-nickname-input').val();
        if(nickname){
            storageStore('grouptubeNickname', nickname, function () {
                user_display_name = nickname;
                $('#grouptube-nickname-promt').remove();
            });
            debugLog('Saved Nickname "'+nickname+'"...');
        }else{
            addToast("Please enter a Username!");
        }
    });

    // Debug
    $(document).on('click', '#grouptube-debug-btn', function () {
        debugLog('Pressed Debug Button...');
    });

    /**
     * Click Event for starting a session
     */
    $(document).on('click', '#grouptube-session-start', function () {
        socket.emit('create_session', chrome.runtime, function (data) {
            if(data.success){
                debugLog('Create Session...');
                /**
                 * Get token and build URL
                 */
                session_token = data.token;
                host = user_display_name;
                is_host = true;
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
                    var time = getVideoTime();
                    socket.emit('video_play_server', session_token, time, function (data) {
                        if(!data.success){
                            throwConsoleError(data);
                        }
                    });
                    debugLog('Play Video: ' + time);
                });

                /**
                 * On video pause, send to server
                 */
                video.on('pause', function (e) {
                    var time = getVideoTime();
                    socket.emit('video_pause_server', session_token, time, function (data) {
                        if(!data.success){
                            throwConsoleError(data);
                        }
                    });
                    debugLog('Pause Video: ' + time);
                });

                /**
                 * On video seeked, send to server
                 */
                video.on('seeked', function() {
                    var time = getVideoTime();
                    socket.emit('video_set_time_server', session_token, time, function (data) {
                        if(!data.success){
                            throwConsoleError(data);
                        }
                    });
                    debugLog('Seek in Video: ' + time);
                });

                /**
                 * Get video playback information
                 */
                socket.on('get_video_properties',function(callback){
                    var data = {
                        'isPlaying': isVideoPlaying(),
                        'time': getVideoTime()
                    };
                    debugLog('Return Video Properties: ' + data);
                    callback(data);
                });

                /**
                 * Update Session (View-count etc.)
                 */
                socket.on('update_session',function(data){
                    debugLog('Update Session: ' + data);
                    updateSession(data);
                });

                /**
                 * On disconnect display overlay
                 */
                socket.on('disconnect',function(data){
                    debugLog('Disconnect...');
                    setPlayVideo(false);
                    showVideoOverlayWithText('Connection to GroupTube Server lost!<br><span style="font-size: 15px;">This may be due to connection issues or the server getting updated.</span>');
                });

                /**
                 * Build view-counter
                 */
                renderGrouptubeButton(getSettingsButtonHtml());
                renderGrouptubeButton(getInviteButtonHtml());
                createViewCounter();
            }else{
                throwConsoleError(data);
            }
        });
    });

    // Toast Container
    createToastContainer();

    // Fetch Settings from Storage & check for token in URL
    getSettingsFromStorage(function () {
        /**
         * If opened GroupTube video URL
         */
        if(getUrlParameter('grouptube_token')){
            var token = getUrlParameter('grouptube_token');
            session_token = token;
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
                        is_host = false;
                        setHost();
                        setPlayVideo(false);
                        setVideoTime(0);
                        setAllowMarkers(data.allow_markers, true);
                        disableControls();
                        createViewCounter();
                        createPageOverlay();
                        renderGrouptubeButton(getSettingsButtonHtml());
                        removeRecommendationWrapper();
                        disableAfterLoad();

                        /**
                         * On Toggle video play
                         */
                        socket.on('video_toggle_play',function(status, time){
                            setPlayVideo(status);
                            setVideoTime(time);
                            debugLog('Toggle Video play: ' + time);
                        });

                        /**
                         * Set the current time of the video
                         */
                        socket.on('video_set_time_client',function(time){
                            setVideoTime(time);
                            debugLog('Set Video time: ' + time);
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
                            debugLog('Toggle Video Properties: ' + data);
                        });

                        /**
                         * Update session (View-count etc.)
                         */
                        socket.on('update_session',function(data){
                            updateSession(data);
                            debugLog('Update Session: ' + data);
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
                            debugLog('Display Close Overlay: ' + url);
                        });

                        /**
                         * On server disconnect, update view-count, pause video and show overlay
                         */
                        socket.on('disconnect',function(data){
                            updateViewCounter("");
                            setPlayVideo(false);
                            showVideoOverlayWithText('Connection to GroupTube Server lost!<br><span style="font-size: 15px;">This may be due to connection issues or the server getting updated.</span>');
                            debugLog('Server Disconnect...');
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
                                    debugLog('Focus Video...');
                                }, 100);
                            }
                        });
                    }else{
                        throwConsoleError(data);
                    }
                });
            });
        }else{
            renderCreateSessionButton();
            renderTooltip();
        }

        /**
         * On Toggle 'allow_markers'
         */
        socket.on('toggle_allow_markers', function(status, isHost){
            setAllowMarkers(status, false, isHost);
            debugLog('Toggle Allow Markers: ' + status);
        });

        /**
         * Render Marker on Video
         */
        socket.on('set_marker', function(name, posRelX, posRelY, color){
            if (!color) color = getRandomMarkerColor();
            var offset = $('video').offset();
            var videoWidth = $('video').outerWidth();
            var videoHeight = $('video').outerHeight();

            var posX = (videoWidth * posRelX) + offset.left;
            var posY = (videoHeight * posRelY) + offset.top;

            var marker_element = $(getMarkerHtml(name, color)).prependTo('body');
            marker_element.offset({top: posY, left: (posX - marker_element.outerWidth())})
            setTimeout(function(){
                marker_element.fadeOut('fast', function(){
                    marker_element.remove();
                });
            }, 1000)
            debugLog('Set Marker: ' + posX + ', ' + posY);
        });
    });


    /**
     * When dev_mode mode is on, render debug button
     */
    if(dev_mode){
        $(document).ready(function(){
            renderGrouptubeButton(getDebugButtonHtml());
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
function getCreateSessionButtonHtml(){
    return `
    <button id="grouptube-session-start" class="ytp-subtitles-button ytp-button grouptube-button" aria-label="Start a GroupTube Session" style="text-align: center;" aria-pressed="false" title="Start a GroupTube Session">
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
    <button id="grouptube-debug-btn" class="ytp-subtitles-button ytp-button grouptube-button" aria-label="Debug GroupTube" style="text-align: center;" aria-pressed="false" title="Debug GroupTube">
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
    <button id="grouptube-nickname-btn" class="ytp-subtitles-button ytp-button grouptube-button" aria-label="Set GroupTube Nickname" style="text-align: center;" aria-pressed="false" title="Set GroupTube Nickname">
        <svg aria-hidden="true" height="100%" width="60%" focusable="false" data-prefix="fas" data-icon="user-tag" class="svg-inline--fa fa-user-tag fa-w-20" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512">
            <path fill="currentColor" d="M630.6 364.9l-90.3-90.2c-12-12-28.3-18.7-45.3-18.7h-79.3c-17.7 0-32 14.3-32 32v79.2c0 17 6.7 33.2 18.7 45.2l90.3 90.2c12.5 12.5 32.8 12.5 45.3 0l92.5-92.5c12.6-12.5 12.6-32.7.1-45.2zm-182.8-21c-13.3 0-24-10.7-24-24s10.7-24 24-24 24 10.7 24 24c0 13.2-10.7 24-24 24zm-223.8-88c70.7 0 128-57.3 128-128C352 57.3 294.7 0 224 0S96 57.3 96 128c0 70.6 57.3 127.9 128 127.9zm127.8 111.2V294c-12.2-3.6-24.9-6.2-38.2-6.2h-16.7c-22.2 10.2-46.9 16-72.9 16s-50.6-5.8-72.9-16h-16.7C60.2 287.9 0 348.1 0 422.3v41.6c0 26.5 21.5 48 48 48h352c15.5 0 29.1-7.5 37.9-18.9l-58-58c-18.1-18.1-28.1-42.2-28.1-67.9z"></path>
        </svg>
    </button>
    `;
}

/**
 * Get invite button html
 */
function getInviteButtonHtml(){
    return `
    <button id="grouptube-invite-btn" class="ytp-subtitles-button ytp-button grouptube-button" aria-label="Copy invite link" style="text-align: center;" aria-pressed="false" title="Copy invite link">
        <svg aria-hidden="true" height="100%" width="50%" focusable="false" data-prefix="fas" data-icon="user-plus" class="svg-inline--fa fa-user-plus fa-w-20" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512">
            <path fill="currentColor" d="M624 208h-64v-64c0-8.8-7.2-16-16-16h-32c-8.8 0-16 7.2-16 16v64h-64c-8.8 0-16 7.2-16 16v32c0 8.8 7.2 16 16 16h64v64c0 8.8 7.2 16 16 16h32c8.8 0 16-7.2 16-16v-64h64c8.8 0 16-7.2 16-16v-32c0-8.8-7.2-16-16-16zm-400 48c70.7 0 128-57.3 128-128S294.7 0 224 0 96 57.3 96 128s57.3 128 128 128zm89.6 32h-16.7c-22.2 10.2-46.9 16-72.9 16s-50.6-5.8-72.9-16h-16.7C60.2 288 0 348.2 0 422.4V464c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48v-41.6c0-74.2-60.2-134.4-134.4-134.4z"></path>
        </svg>
    </button>
    `;
}

/**
 * Get settings button html
 */
function getSettingsButtonHtml(){
    return `
    <button id="grouptube-settings-button" class="ytp-subtitles-button ytp-button grouptube-button" aria-label="Grouptube Settings" style="text-align: center;" aria-pressed="false" title="Grouptube Settings">
        <svg aria-hidden="true" height="100%" width="50%" focusable="false" data-prefix="fas" data-icon="users-cog" class="svg-inline--fa fa-users-cog fa-w-20" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512">
            <path fill="currentColor" d="M610.5 341.3c2.6-14.1 2.6-28.5 0-42.6l25.8-14.9c3-1.7 4.3-5.2 3.3-8.5-6.7-21.6-18.2-41.2-33.2-57.4-2.3-2.5-6-3.1-9-1.4l-25.8 14.9c-10.9-9.3-23.4-16.5-36.9-21.3v-29.8c0-3.4-2.4-6.4-5.7-7.1-22.3-5-45-4.8-66.2 0-3.3.7-5.7 3.7-5.7 7.1v29.8c-13.5 4.8-26 12-36.9 21.3l-25.8-14.9c-2.9-1.7-6.7-1.1-9 1.4-15 16.2-26.5 35.8-33.2 57.4-1 3.3.4 6.8 3.3 8.5l25.8 14.9c-2.6 14.1-2.6 28.5 0 42.6l-25.8 14.9c-3 1.7-4.3 5.2-3.3 8.5 6.7 21.6 18.2 41.1 33.2 57.4 2.3 2.5 6 3.1 9 1.4l25.8-14.9c10.9 9.3 23.4 16.5 36.9 21.3v29.8c0 3.4 2.4 6.4 5.7 7.1 22.3 5 45 4.8 66.2 0 3.3-.7 5.7-3.7 5.7-7.1v-29.8c13.5-4.8 26-12 36.9-21.3l25.8 14.9c2.9 1.7 6.7 1.1 9-1.4 15-16.2 26.5-35.8 33.2-57.4 1-3.3-.4-6.8-3.3-8.5l-25.8-14.9zM496 368.5c-26.8 0-48.5-21.8-48.5-48.5s21.8-48.5 48.5-48.5 48.5 21.8 48.5 48.5-21.7 48.5-48.5 48.5zM96 224c35.3 0 64-28.7 64-64s-28.7-64-64-64-64 28.7-64 64 28.7 64 64 64zm224 32c1.9 0 3.7-.5 5.6-.6 8.3-21.7 20.5-42.1 36.3-59.2 7.4-8 17.9-12.6 28.9-12.6 6.9 0 13.7 1.8 19.6 5.3l7.9 4.6c.8-.5 1.6-.9 2.4-1.4 7-14.6 11.2-30.8 11.2-48 0-61.9-50.1-112-112-112S208 82.1 208 144c0 61.9 50.1 112 112 112zm105.2 194.5c-2.3-1.2-4.6-2.6-6.8-3.9-8.2 4.8-15.3 9.8-27.5 9.8-10.9 0-21.4-4.6-28.9-12.6-18.3-19.8-32.3-43.9-40.2-69.6-10.7-34.5 24.9-49.7 25.8-50.3-.1-2.6-.1-5.2 0-7.8l-7.9-4.6c-3.8-2.2-7-5-9.8-8.1-3.3.2-6.5.6-9.8.6-24.6 0-47.6-6-68.5-16h-8.3C179.6 288 128 339.6 128 403.2V432c0 26.5 21.5 48 48 48h255.4c-3.7-6-6.2-12.8-6.2-20.3v-9.2zM173.1 274.6C161.5 263.1 145.6 256 128 256H64c-35.3 0-64 28.7-64 64v32c0 17.7 14.3 32 32 32h65.9c6.3-47.4 34.9-87.3 75.2-109.4z"></path>
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
    <div class="grouptube-tooltip" style="display:none; position: absolute; max-width: 300px; bottom: 50px; left: 969px; z-index: 1002; background-color: rgba(28,28,28,0.9); border-radius: 2px; padding: 5px 9px;font-size: 118%; font-weight: 500; line-height: 15px;">
        Deafult Text
    </div>
    `;
}

/**
 * Render tooltip
 */
function renderTooltip() {
    if($('.grouptube-tooltip').length === 0){
        $('#movie_player').append(getTooltipHtml());
    }
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
 * Get Info html for toast
 */
function getToastInfoHtml() {
    return `
    <span style="width: 25px;margin-bottom: -4px;color: deepskyblue;">
        <svg height="100%" width="60%" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="info-circle" class="svg-inline--fa fa-info-circle fa-w-16" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
            <path fill="currentColor" d="M256 8C119.043 8 8 119.083 8 256c0 136.997 111.043 248 248 248s248-111.003 248-248C504 119.083 392.957 8 256 8zm0 110c23.196 0 42 18.804 42 42s-18.804 42-42 42-42-18.804-42-42 18.804-42 42-42zm56 254c0 6.627-5.373 12-12 12h-88c-6.627 0-12-5.373-12-12v-24c0-6.627 5.373-12 12-12h12v-64h-12c-6.627 0-12-5.373-12-12v-24c0-6.627 5.373-12 12-12h64c6.627 0 12 5.373 12 12v100h12c6.627 0 12 5.373 12 12v24z"></path>
        </svg>
    </span>
    `;
}

/**
 * Get Marker Html
 */
function getMarkerHtml(name, color) {
    if (!name) name = 'Guest';
    return `
    <div class="grouptube-video-marker" style="position: absolute;z-index: 1000001;width: 40px;color: ` + color + `;">
        <svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="location-arrow" class="svg-inline--fa fa-location-arrow fa-w-16" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="filter: drop-shadow(3px 3px 1px rgb(0 0 0 / .5));">
            <path fill="currentColor" d="M444.52 3.52L28.74 195.42c-47.97 22.39-31.98 92.75 19.19 92.75h175.91v175.91c0 51.17 70.36 67.17 92.75 19.19l191.9-415.78c15.99-38.39-25.59-79.97-63.97-63.97z"></path>
        </svg>
        <span style="background: #00000059;display: block;text-align: center;font-size: 11px;margin: 8px 0;padding: 3px 0;border-radius: 4px;color: white;">
            `+name+`
        </span>
    </div>
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
    debugLog('Set Video play: ' + status);
}

/**
 * Check if video is currently playing
 */
function isVideoPlaying() {
    var isPlaying = !$('video')[0].paused;
    debugLog('Check Video play: ' + isPlaying);
    return isPlaying;
}

/**
 * Set current video playtime
 */
function setVideoTime(time){
    var video = $('video');
    if(time <= (video[0].duration - 0.25)){
        video[0].currentTime = time;
        debugLog('Set Video Playtime: ' + time);
    }
}

/**
 * Get current video playtime
 */
function getVideoTime() {
    var videoTime = $('video')[0].currentTime;
    debugLog('Check Video play: ' + videoTime);
    return videoTime;
}

/**
 * Disable video controls for client
 */
function disableControls() {
    $('.ytp-play-button.ytp-button, .ytp-next-button.ytp-button, .ytp-miniplayer-button.ytp-button, .ytp-right-controls>[class=ytp-button]').attr('disabled', 'disabled').css('pointer-events', 'none').css('opacity', '0.2');
    $('#movie_player, video, .ytp-progress-bar-container').css('pointer-events', 'none');
    $('.ytp-chrome-controls').css('pointer-events', 'all');
    if(host){
        addToast(getToastInfoHtml() + 'Video is controlled by ' + host + '.');
    }else{
        addToast(getToastInfoHtml() + 'Video is controlled by GroupTube Session Owner.');
    }
    debugLog('Disable Video Controls...');
}

/**
 * Set video text in control bar
 * currently not used!
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
    debugLog('Set Video Text...');
}

/**
 * Set the 'allow_markers' value & display notification
 */
function setAllowMarkers(status, onJoin, isHost){
    if(!onJoin) onJoin = false;
    if(!isHost) isHost = false;
    allow_markers = status
    if (!isHost) {
        if (allow_markers) {
            addToast(getToastInfoHtml() + 'The host enabled Video Markers! You may place them on the video using right click!', 5000);
        }else{
            if (!onJoin) {
                addToast(getToastInfoHtml() + 'The host disabled Video Markers! You may no longer place markers!', 2000);
            }
        }
        debugLog('Set Allow Markers: ' + allow_markers);
    }
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
    debugLog('Render Video Overlay: ' + text);
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
    $('#player-container:not(.ytd-miniplayer)').css('z-index','1000000');
    setInterval(function (){
        if($('#player-container:not(.ytd-miniplayer)').css('z-index') !== '1000000'){
            $('#player-container:not(.ytd-miniplayer)').css('z-index','1000000');
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
    debugLog('Add Toast: ' + message);
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
 * Check if the current url includes "watch"
 */
function isOnVideoPage(){
    return location.pathname.includes('watch');
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
        addToast(getToastInfoHtml() + 'Video URL has been copied to Clipboard. Send it to your friends 🙂');
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
 * Display create session button
 */
function renderCreateSessionButton() {
    $(document).ready(function(){
        if(!isLiveStream() && $('#grouptube-session-start').length === 0){
            renderGrouptubeButton(getCreateSessionButtonHtml());
        }
    });
}

/**
 * Render a default button in the controls pane with the given html
 */
function renderGrouptubeButton(html) {
    $('.ytp-right-controls').prepend(html);
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

function getSettingsFromStorage(callback) {
    var key1 = 'grouptubeNickname';
    var key2 = 'grouptubeDebugLog';
    storageRetrieve([key1, key2], function (data) {
        // Nickname
        if(data[key1] === undefined){
            renderNicknamePromt();
        }else{
            user_display_name = data[key1];
        }
        // DebugLog
        if(data[key2] === undefined){
            storageStore(key2, false, () => {});
        }else{
            debug_log = data[key2];
        }
        // Render Nickname Button
        $(document).ready(function(){
            renderGrouptubeButton(getNicknameButtonHtml());
        });
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

function renderSettingsPromt() {
    $(document).ready(function() {
        $('body').prepend(`
            <div id="grouptube-settings" style="position: fixed;top: 0;left: 0;width: 100%;height: 100%;z-index: 1100000;background-color: rgba(0,0,0,0.8);">
                <div id="grouptube-settings-body" style="position: absolute;top: 50%;left: 50%;transform: translate(-50%, -50%);width: 30rem;height: 25rem;display: flex;flex-direction: column;align-items: center;justify-content: space-evenly;text-align: center;background: #2d2e31;border-radius: 4px;box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.28);padding: 0 24px;color: white;">
                    <h1>GroupTube Settings</h1>
                    
                    <div style="font-size: 14px;`+(!is_host ? 'display:none;' : '')+`">
                        <div style="display: block;">
                            <label for="grouptube-allow-markers">
                                <input id="grouptube-allow-markers" type="checkbox" style="position: relative;vertical-align: middle;bottom: 1px;" `+(allow_markers ? 'checked' : '')+`>
                                Video Markers
                            </label>
                            <svg data-help-text="Allowing this will let users place markers on the video using right click. Only the host can activate this." height="12" width="12" style="cursor: pointer;" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="question-circle" class="svg-inline--fa fa-question-circle fa-w-16" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M504 256c0 136.997-111.043 248-248 248S8 392.997 8 256C8 119.083 119.043 8 256 8s248 111.083 248 248zM262.655 90c-54.497 0-89.255 22.957-116.549 63.758-3.536 5.286-2.353 12.415 2.715 16.258l34.699 26.31c5.205 3.947 12.621 3.008 16.665-2.122 17.864-22.658 30.113-35.797 57.303-35.797 20.429 0 45.698 13.148 45.698 32.958 0 14.976-12.363 22.667-32.534 33.976C247.128 238.528 216 254.941 216 296v4c0 6.627 5.373 12 12 12h56c6.627 0 12-5.373 12-12v-1.333c0-28.462 83.186-29.647 83.186-106.667 0-58.002-60.165-102-116.531-102zM256 338c-25.365 0-46 20.635-46 46 0 25.364 20.635 46 46 46s46-20.636 46-46c0-25.365-20.635-46-46-46z"></path></svg>
                        </div>
                        <small style="font-size: 12px;">Allow joined users to place markers on the video.</small>
                    </div>
                    
                    <div style="font-size: 14px;">
                        <div style="display: block;">
                            <label for="grouptube-debug-log">
                                <input id="grouptube-debug-log" type="checkbox" style="position: relative;vertical-align: middle;bottom: 1px;" `+(debug_log ? 'checked' : '')+`>
                                Debug Logs
                            </label>
                            <svg data-help-text="Activating this will print various debug messages to the Developer Console of your Browser. This setting will be saved for all future sessions." height="12" width="12" style="cursor: pointer;" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="question-circle" class="svg-inline--fa fa-question-circle fa-w-16" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M504 256c0 136.997-111.043 248-248 248S8 392.997 8 256C8 119.083 119.043 8 256 8s248 111.083 248 248zM262.655 90c-54.497 0-89.255 22.957-116.549 63.758-3.536 5.286-2.353 12.415 2.715 16.258l34.699 26.31c5.205 3.947 12.621 3.008 16.665-2.122 17.864-22.658 30.113-35.797 57.303-35.797 20.429 0 45.698 13.148 45.698 32.958 0 14.976-12.363 22.667-32.534 33.976C247.128 238.528 216 254.941 216 296v4c0 6.627 5.373 12 12 12h56c6.627 0 12-5.373 12-12v-1.333c0-28.462 83.186-29.647 83.186-106.667 0-58.002-60.165-102-116.531-102zM256 338c-25.365 0-46 20.635-46 46 0 25.364 20.635 46 46 46s46-20.636 46-46c0-25.365-20.635-46-46-46z"></path></svg>
                        </div>
                        <small style="font-size: 12px;">Print various debug logs to the console.</small>
                    </div>

                    <button id="grouptube-settings-save" style="background-color: #cc0000;padding: 10px 16px;border-radius: 2px;border: none;color: white;font-weight: bold;text-transform: uppercase;font-family: 'Roboto', 'Noto', sans-serif;font-size: 13px;cursor: pointer;">Save</button>
                </div>
            </div>
        `);
    });
}

function debugLog(message) {
    if (debug_log) {
        var messageString = '%c' + message
        console.log('%c[GroupTube] '+messageString, 'color: #b93232', 'color: #ccc')
    }
}

function getRandomMarkerColor() {
    let hue = Math.floor(Math.random() * 360);
    return "hsl(" + hue + "deg 20% 45%)";
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

function storageRemove(key, callback){
    chrome.storage.sync.remove(key, function () {
        callback();
    });
}

function storageClear(callback){
    chrome.storage.sync.clear(function () {
        callback();
    });
}
