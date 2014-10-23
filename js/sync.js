var firebase = new Firebase('https://zhongchiyu.firebaseio.com/');
// remove hash & base64
var appName = btoa(location.href.slice(0, location.href.indexOf(location.hash)));

$$(document.body).append('<div id="qrcode" class="hidden"></div>');
var qrcodeEl = document.getElementById('qrcode');
var qrcode = new QRCode(qrcodeEl, location.href);

$$('body').on('hold', function() {
    $$(qrcodeEl).toggleClass('hidden');
});

$$('body').on('doubleTap', function() {
    var isPublisher = false;
    $$('body').on('singleTap', function() {
        isPublisher = true;
        publish();
    });

    setTimeout(function() {
        $$('body').off('singleTap');
        if (!isPublisher) subscribe();
    }, 1000);
});

function subscribe() {
    alert('subscribe mode');
    var first = true;
    firebase.child(appName).on('value', function(snapshot) {
        console.log(snapshot.val());
        if (!first) {
            location.href = snapshot.val();
        }
        first = false;
    });
}

function publish() {
    alert('publish mode');
    var url = location.href;
    var data = {};
    var interval = setInterval(function() {
        if (url !== location.href) {
            url = location.href;
            data[appName] = location.href;
            firebase.update(data);
        }
    }, 100);
}
