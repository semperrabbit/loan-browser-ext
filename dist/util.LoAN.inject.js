global.injectLoAN = function(){
    var output = `<SCRIPT>
if(!window.LoANInjected){
    window.LoANInjected = true;
    xhr=new XMLHttpRequest();
    xhr.open('GET', 'https://raw.githubusercontent.com/semperrabbit/loan-browser-ext/master/dist/alliance-overlay.user.js', true);
    xhr.onreadystatechange=function(){
      if(xhr.readyState===XMLHttpRequest.DONE&&xhr.status===200){
        let src=document.createElement('script');
        src.lang='javascript';
        src.innerHTML=xhr.responseText;
        document.head.appendChild(src);
        console.log('resp',xhr.responseText);
      }
    };
    xhr.send();
}
</SCRIPT>`
    console.log(output.split('\n').join(';'));

}
injectLoAN();