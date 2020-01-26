var socket = io('https://socket.lassejacobsen.de');

$('#video_play').on('click', function () {
    socket.emit('video_play_server');
});

$('#video_pause').on('click', function () {
    socket.emit('video_pause_server');
});

$('#video_restart').on('click', function () {
    socket.emit('video_restart_server');
});

$('#video_set_zero').on('click', function () {
    socket.emit('video_set_zero_server');
});

$('#test').on('click', function () {
    socket.emit('debug', function (data) {
        console.log(data);
    });
});

socket.on('session_url',function(url){
    $('#session_url').html('<a href="'+url+'">Link</a>');
});