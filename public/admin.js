window.onload = () => {
    var shortenBtn = document.getElementById("shorten")
    shortenBtn.addEventListener('click', shorten)

    var secret = localStorage.getItem("secret")
    if (secret != null && secret != "")
        document.getElementById("secret").value = secret
}

function shorten() {

    resetAll() 

    var dest = document.getElementById("dest"),
        slug = document.getElementById("slug"),
        secret = document.getElementById("secret"),
        error = document.getElementById("error"),
        success = document.getElementById("success")
    
    dest.value = dest.value.trim()
    slug.value = slug.value.trim()

    if (dest.value == "") {
        dest.classList.add("is-danger")
        error.innerHTML = "You must provide a destination."
        return;
    }
    else if (secret.value == "") {
        secret.classList.add("is-danger")
        error.innerHTML = "You must provide an app password as authentication."
        return;
    } else if (!validURL(dest.value)) {
        dest.classList.add("is-danger")
        error.innerHTML = "You must provide a valid link as the destination."
        return;
    } else {

        if (!(dest.value.substring(0, 7) == "http://" || dest.value.substring(0, 8) == "https://"))
            dest.value = "http://" + dest.value

        var xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/push", true);
        xhr.setRequestHeader('Content-Type', 'application/json');

        if (slug.value == "") {
            xhr.send(JSON.stringify({
                auth: secret.value,
                dest: dest.value
            }));
        } else {
            xhr.send(JSON.stringify({
                auth: secret.value,
                dest: dest.value,
                slug: slug.value
            }));
        }

        xhr.onload = function () {
            var data = JSON.parse(this.responseText);

            if (data.status == 401) {
                secret.classList.add("is-danger")
                error.innerHTML = "Invalid app password."
            } else if (data.status == 500) {
                error.innerHTML = data.error
            } else {
                error.innerHTML = ""
                success.innerHTML = "Success! Short URL has been copied to your clipboard."
                dest.value = window.location.protocol + "//" + window.location.host + "/" + data.slug
                copyStringToClipboard(dest.value)

                localStorage.setItem('secret', secret.value);
            }
        }

    }

}

function resetAll() {
    var inputs = document.querySelectorAll("input")

    for (i = 0; i < inputs.length; i++)
        inputs[i].classList.remove("is-danger")

    document.getElementById("success").innerHTML = ""
    document.getElementById("error").innerHTML = ""
}

function copyStringToClipboard(str) {
    var el = document.createElement('textarea');
    el.value = str;
    el.setAttribute('readonly', '');
    el.style = { position: 'absolute', left: '-9999px' };
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
}

function validURL(str) {
    var pattern = new RegExp('^(https?:\\/\\/)?' + // protocol
        '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
        '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
        '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
        '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
        '(\\#[-a-z\\d_]*)?$', 'i'); // fragment locator
    return !!pattern.test(str);
}