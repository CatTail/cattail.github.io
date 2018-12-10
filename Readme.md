# Blog
> CatTail's personal blog

## Installation

    gem install bundler
    bundle install

## Usage

Start dev server

    bundle exec jekyll serve

Or use Docker

    docker run --rm --volume="$PWD:/srv/jekyll" --volume="$PWD/vendor/bundle:/usr/local/bundle" -it jekyll/jekyll jekyll serve
