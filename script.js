const container = document.getElementById('articles_container')

async function searchDisplay() {
    const search = document.getElementById('search_input').value;
    console.log(search)
    if(search.trim().length > 0) {
        container.innerHTML = ''
        let res = await fetch(`https://newsapi.org/v2/everything?q=${search}&from=2026-03-01&sortBy=publishedAt&apiKey=1a2dc120e38a4e64b0de4a8bcd8f2523`);

        let data = await res.json();

        for(let news of data.articles) {
            container.innerHTML += `
            <div class='article_container'> 
                <h2>${news.title}</h2>
                <hr/>
                <h3>${news.description}</h3>
                <br/>
                <h4>${news.content}</h4>
            </div>
            `
        }
    }
}

document.getElementById('search').addEventListener('click', searchDisplay)