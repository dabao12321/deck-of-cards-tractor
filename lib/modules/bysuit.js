
import getFontSize from '../fontSize'

var fontSize

// export default {
//   deck: function (deck) {
//     deck.bysuit = deck.queued(bysuit)

//     function bysuit (next) {
//       var cards = deck.cards

//       fontSize = getFontSize()

//       cards.forEach(function (card) {
//         card.bysuit(function (i) {
//           if (i === cards.length - 1) {
//             next()
//           }
//         })
//       })
//     }
//   },
//   card: function (card) {
//     var rank = card.rank
//     var suit = card.suit

//     card.bysuit = function (cb) {
//       var i = card.i
//       var delay = i * 10

//       card.animateTo({
//         delay: delay,
//         duration: 400,

//         x: -Math.round((6.75 - rank) * 8 * fontSize / 16),
//         y: -Math.round((1.5 - suit) * 92 * fontSize / 16),
//         rot: 0,

//         onComplete: function () {
//           cb(i)
//         }
//       })
//     }
//   }
// }

export default {
  deck: function(deck) {
    deck.bysuit = deck.queued(bysuit)
    
    function bysuit(next) {
      var cards = deck.cards
      fontSize = getFontSize()
      
      cards.forEach(function(card) {
        var isJoker = card.suit === 4
        
        card.bysuit(function(i) {
          if (i === cards.length - 1) {
            next()
          }
        })
      })
    }
  },
  card: function(card) {
    var $el = card.$el
    
    card.bysuit = function(cb) {
      var i = card.i
      var delay = i * 10
      var isJoker = card.suit === 4
      
      // Position jokers at the top
      var x = isJoker ? 
        -Math.round((card.rank - 1.5) * 8 * fontSize / 16) : 
        -Math.round((6.75 - card.rank) * 8 * fontSize / 16)
      var y = isJoker ? 
        -Math.round(2.5 * 92 * fontSize / 16) : 
        -Math.round((1.5 - card.suit) * 92 * fontSize / 16)
        
      card.animateTo({
        delay: delay,
        duration: 400,
        x: x,
        y: y,
        rot: 0,
        onComplete: function() {
          cb(i)
        }
      })
    }
  }
}