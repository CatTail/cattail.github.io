var firebase = new Firebase("https://remork.firebaseio.com/");
var url, first = true;

update();

firebase.child("url").on("value", function(snapshot) {
    console.log(snapshot.val());
    first = false;
    if (!first) {
        window.location.href = url = snapshot.val();
    }
});

setInterval(function() {
    if (url !== window.location.href) {
        update();
    }
}, 100);

function update() {
    url = window.location.href;
    firebase.update({
        url: url
    });
}
